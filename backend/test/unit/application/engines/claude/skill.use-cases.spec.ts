import { describe, expect, it } from 'vitest';

import type { FolderAccess } from '@application/agent-settings';
import { RecordAuditEventUseCase } from '@application/audit';
import {
  ClaudeInstallationCatalog,
  ReadProjectSkillsUseCase,
  ReadSkillPreferencesUseCase,
  SaveSkillPreferencesUseCase,
} from '@application/engines/claude';
import type {
  ProjectCommandFile,
  ProjectSkillFiles,
  SkillDependencies,
  SkillPluginCandidateSet,
  SkillPluginCandidates,
  SkillPreferencesRepository,
} from '@application/engines/claude';
import { UserId } from '@domain/auth';
import { SkillNameInvalidError } from '@domain/engines/claude';
import type {
  ClaudeInitialization,
  SkillPreferences,
  SkillPreferencesDefaults,
} from '@domain/engines/claude';
import type { SlashCommand } from '@domain/session';
import {
  WorkspaceForbiddenError,
  WorkspaceNotAllowedError,
  WorkspacePath,
} from '@domain/workspace';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { RecordingAuditEvents } from '../../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';

const USER = UserId.create('auth|skills-owner');
const STRANGER = UserId.create('auth|someone-else');
const ROOT = '/srv/projects';
const clock = new FixedClock(new Date('2026-10-24T12:00:00Z'));

function skill(name: string, description = ''): SlashCommand {
  return { name, description, argumentHint: '', aliases: [], builtin: false };
}

function folders(root = ROOT): FolderAccess {
  const resolve: FolderAccess['resolve'] = (raw, userId) => {
    if (!raw.startsWith(root)) return Promise.reject(new WorkspaceNotAllowedError(raw));
    if (userId.value !== USER.value) return Promise.reject(new WorkspaceForbiddenError(raw));
    return Promise.resolve(WorkspacePath.create(raw));
  };
  return {
    resolve,
    locate: async (raw, userId) => ({ folder: await resolve(raw, userId), root }),
    firstRoot: () => Promise.resolve(WorkspacePath.create(root)),
  };
}

const EMPTY_INITIALIZATION: ClaudeInitialization = {
  commands: [],
  agents: [],
  models: [],
  outputStyle: 'default',
  outputStyles: [],
  skills: [],
  account: {
    email: null,
    organization: null,
    plan: null,
    provider: 'firstParty',
    tokenSource: null,
    apiKeySource: null,
  },
};

function catalogOf(skills: readonly SlashCommand[]): ClaudeInstallationCatalog {
  return new ClaudeInstallationCatalog(
    { initializationOf: () => Promise.resolve(null) },
    {
      probe: () =>
        Promise.resolve({
          cliVersion: '2.1.277',
          initialization: { ...EMPTY_INITIALIZATION, skills },
        }),
    },
    clock,
    { cliVersion: '2.1.277', configDir: '/home/me/.claude' },
  );
}

function projectSkillFilesOf(files: readonly ProjectCommandFile[] = []): ProjectSkillFiles {
  return { filesIn: () => Promise.resolve(files) };
}

const EMPTY_CANDIDATES: SkillPluginCandidateSet = { included: [], excludedForHook: [] };

function skillPluginsOf(
  user: SkillPluginCandidateSet = EMPTY_CANDIDATES,
  system: SkillPluginCandidateSet = EMPTY_CANDIDATES,
): SkillPluginCandidates {
  return { user: () => Promise.resolve(user), system: () => Promise.resolve(system) };
}

/** An in-memory `claude_skill_preferences`, the same shape the Drizzle repository reads/writes. */
class InMemorySkillPreferencesRepository implements SkillPreferencesRepository {
  private user: SkillPreferences | null = null;
  private readonly overrides = new Map<string, SkillPreferences>();

  async read(): Promise<SkillPreferencesDefaults> {
    return {
      user: this.user,
      overrides: [...this.overrides.entries()].map(([folder, value]) => ({ folder, value })),
    };
  }

  async save(_userId: UserId, folder: string | null, preferences: SkillPreferences): Promise<void> {
    if (folder === null) {
      this.user = preferences;
    } else {
      this.overrides.set(folder, preferences);
    }
  }
}

function depsOf(overrides: Partial<SkillDependencies> = {}): SkillDependencies {
  return {
    engine: 'claude',
    folders: folders(),
    catalog: catalogOf([]),
    projectSkillFiles: projectSkillFilesOf(),
    skillPlugins: skillPluginsOf(),
    preferences: new InMemorySkillPreferencesRepository(),
    trail: new RecordAuditEventUseCase(new RecordingAuditEvents(), new SequentialIds()),
    clock,
    ...overrides,
  };
}

describe('ReadProjectSkillsUseCase — plan 13, B-34', () => {
  it('lists a project skill with its source file and, enabled by default (S-154)', async () => {
    const view = await new ReadProjectSkillsUseCase(
      depsOf({
        catalog: catalogOf([skill('review', 'Reviews a PR')]),
        projectSkillFiles: projectSkillFilesOf([
          { name: 'review', relativePath: '.claude/skills/review/SKILL.md' },
        ]),
      }),
    ).execute(USER, '/srv/projects/app');

    expect(view).toEqual([
      {
        name: 'review',
        origin: 'project',
        description: 'Reviews a PR',
        sourceFile: '.claude/skills/review/SKILL.md',
        enabled: true,
        unloadedReason: null,
      },
    ]);
  });

  it('badges a user skill, qualified by its plugin, off by the safety default (D-20)', async () => {
    const view = await new ReadProjectSkillsUseCase(
      depsOf({ catalog: catalogOf([skill('remote-claude-user:draft', 'Drafts something')]) }),
    ).execute(USER, '/srv/projects/app');

    expect(view).toEqual([
      {
        name: 'draft',
        origin: 'user',
        description: 'Drafts something',
        sourceFile: null,
        enabled: false,
        unloadedReason: null,
      },
    ]);
  });

  it('lists the user’s and the project’s own skills of the same bare name separately (S-157)', async () => {
    const view = await new ReadProjectSkillsUseCase(
      depsOf({
        catalog: catalogOf([skill('explain'), skill('remote-claude-user:explain')]),
      }),
    ).execute(USER, '/srv/projects/app');

    expect(view.map((row) => [row.name, row.origin])).toEqual([
      ['explain', 'project'],
      ['explain', 'user'],
    ]);
  });

  it('lists a hook-excluded candidate too, with the reason, never in silence (S-167)', async () => {
    const view = await new ReadProjectSkillsUseCase(
      depsOf({ skillPlugins: skillPluginsOf({ included: [], excludedForHook: ['risky'] }) }),
    ).execute(USER, '/srv/projects/app');

    expect(view).toEqual([
      {
        name: 'risky',
        origin: 'user',
        description: '',
        sourceFile: null,
        enabled: false,
        unloadedReason: 'declaresHook',
      },
    ]);
  });

  it('lists a system candidate a hook kept out too, the same way (S-167)', async () => {
    const view = await new ReadProjectSkillsUseCase(
      depsOf({
        skillPlugins: skillPluginsOf(EMPTY_CANDIDATES, {
          included: [],
          excludedForHook: ['risky-system'],
        }),
      }),
    ).execute(USER, '/srv/projects/app');

    expect(view).toEqual([
      {
        name: 'risky-system',
        origin: 'system',
        description: '',
        sourceFile: null,
        enabled: false,
        unloadedReason: 'declaresHook',
      },
    ]);
  });

  it('marks a skill disabled by an exact preference entry, even with its origin on (S-158)', async () => {
    const preferences = new InMemorySkillPreferencesRepository();
    await preferences.save(USER, null, {
      sources: { user: true },
      disabledSkills: ['remote-claude-user:draft'],
    });

    const view = await new ReadProjectSkillsUseCase(
      depsOf({
        catalog: catalogOf([skill('remote-claude-user:draft')]),
        preferences,
      }),
    ).execute(USER, '/srv/projects/app');

    expect(view[0]?.enabled).toBe(false);
  });

  it('refuses a folder outside the allowlist, and one of another user', async () => {
    const useCase = new ReadProjectSkillsUseCase(depsOf());

    await expect(useCase.execute(USER, '/elsewhere')).rejects.toThrow(WorkspaceNotAllowedError);
    await expect(useCase.execute(STRANGER, '/srv/projects/app')).rejects.toThrow(
      WorkspaceForbiddenError,
    );
  });
});

describe('SaveSkillPreferencesUseCase — plan 13, B-34; D-04, D-20', () => {
  it('saves the whole value at the user’s own level, folder `null`', async () => {
    const preferences = new InMemorySkillPreferencesRepository();
    const useCase = new SaveSkillPreferencesUseCase(depsOf({ preferences }));

    const saved = await useCase.execute(USER, null, {
      sources: { user: true },
      disabledSkills: [],
    });

    expect(saved).toEqual({ sources: { user: true }, disabledSkills: [] });
    expect(await preferences.read()).toEqual({
      user: { sources: { user: true }, disabledSkills: [] },
      overrides: [],
    });
  });

  it('saves at a folder’s own level, through the allowlist', async () => {
    const preferences = new InMemorySkillPreferencesRepository();
    await new SaveSkillPreferencesUseCase(depsOf({ preferences })).execute(
      USER,
      '/srv/projects/app',
      { sources: { system: true }, disabledSkills: [] },
    );

    expect(await preferences.read()).toEqual({
      user: null,
      overrides: [
        { folder: '/srv/projects/app', value: { sources: { system: true }, disabledSkills: [] } },
      ],
    });
  });

  it('widens an existing folder override in place, finding it among others already stored', async () => {
    const preferences = new InMemorySkillPreferencesRepository();
    await preferences.save(USER, '/srv/projects/other', {
      sources: { user: true },
      disabledSkills: [],
    });
    await preferences.save(USER, '/srv/projects/app', {
      sources: {},
      disabledSkills: [],
    });

    const saved = await new SaveSkillPreferencesUseCase(depsOf({ preferences })).execute(
      USER,
      '/srv/projects/app',
      { sources: { system: true }, disabledSkills: [] },
    );

    expect(saved).toEqual({ sources: { system: true }, disabledSkills: [] });
  });

  it('records engine.skillSourceToggled, with the engine and the origin, turning one on (S-164)', async () => {
    const events = new RecordingAuditEvents();
    const trail = new RecordAuditEventUseCase(events, new SequentialIds());

    await new SaveSkillPreferencesUseCase(depsOf({ trail })).execute(USER, null, {
      sources: { user: true },
      disabledSkills: [],
    });

    expect(events.kinds).toEqual(['engine.skillSourceToggled']);
    expect(events.appended[0]?.details).toEqual({ engine: 'claude', folder: null, origin: 'user' });
  });

  it('records nothing turning an origin off, or singling out one skill (D-20’s asymmetry)', async () => {
    const preferences = new InMemorySkillPreferencesRepository();
    await preferences.save(USER, null, { sources: { user: true }, disabledSkills: [] });
    const events = new RecordingAuditEvents();
    const trail = new RecordAuditEventUseCase(events, new SequentialIds());

    await new SaveSkillPreferencesUseCase(depsOf({ preferences, trail })).execute(USER, null, {
      sources: { user: false },
      disabledSkills: [],
    });
    await new SaveSkillPreferencesUseCase(depsOf({ preferences, trail })).execute(USER, null, {
      sources: { user: false },
      disabledSkills: ['explain'],
    });

    expect(events.kinds).toEqual([]);
  });

  it('writes nothing, and records no event, saving the same preferences twice (S-163)', async () => {
    const preferences = new InMemorySkillPreferencesRepository();
    await preferences.save(USER, null, { sources: { user: true }, disabledSkills: ['a'] });
    const events = new RecordingAuditEvents();
    const trail = new RecordAuditEventUseCase(events, new SequentialIds());

    const saved = await new SaveSkillPreferencesUseCase(depsOf({ preferences, trail })).execute(
      USER,
      null,
      { sources: { user: true }, disabledSkills: ['a'] },
    );

    expect(saved).toEqual({ sources: { user: true }, disabledSkills: ['a'] });
    expect(events.kinds).toEqual([]);
  });

  it('leaves the preferences unsaved when the trail cannot take a widening event (D-20, D-10)', async () => {
    const preferences = new InMemorySkillPreferencesRepository();
    const events = new RecordingAuditEvents();
    events.failure = new Error('trail unavailable');
    const trail = new RecordAuditEventUseCase(events, new SequentialIds());

    await expect(
      new SaveSkillPreferencesUseCase(depsOf({ preferences, trail })).execute(USER, null, {
        sources: { user: true },
        disabledSkills: [],
      }),
    ).rejects.toThrow('trail unavailable');

    expect(await preferences.read()).toEqual({ user: null, overrides: [] });
  });

  it('refuses a malformed skill name (S-160)', async () => {
    await expect(
      new SaveSkillPreferencesUseCase(depsOf()).execute(USER, null, {
        sources: {},
        disabledSkills: ['Not Valid'],
      }),
    ).rejects.toThrow(SkillNameInvalidError);
  });

  it('validates the bare local part of a qualified name, not the plugin namespace', async () => {
    await expect(
      new SaveSkillPreferencesUseCase(depsOf()).execute(USER, null, {
        sources: {},
        disabledSkills: ['remote-claude-user:valid-name'],
      }),
    ).resolves.toBeDefined();
  });

  it('refuses a folder outside the allowlist, and one of another user (S-161)', async () => {
    const useCase = new SaveSkillPreferencesUseCase(depsOf());
    const preferences: SkillPreferences = { sources: {}, disabledSkills: [] };

    await expect(useCase.execute(USER, '/elsewhere', preferences)).rejects.toThrow(
      WorkspaceNotAllowedError,
    );
    await expect(useCase.execute(STRANGER, '/srv/projects/app', preferences)).rejects.toThrow(
      WorkspaceForbiddenError,
    );
  });
});

describe('ReadSkillPreferencesUseCase — plan 13, B-34', () => {
  it('is the safety default, from "installation", with no row anywhere', async () => {
    const view = await new ReadSkillPreferencesUseCase(depsOf()).execute(USER, null);

    expect(view).toEqual({
      effective: { value: { sources: {}, disabledSkills: [] }, from: 'installation' },
      user: null,
      folder: null,
    });
  });

  it('reads the user’s own, and a folder’s own override, separately', async () => {
    const preferences = new InMemorySkillPreferencesRepository();
    await preferences.save(USER, null, { sources: { user: true }, disabledSkills: [] });
    await preferences.save(USER, '/srv/projects/app', {
      sources: { system: true },
      disabledSkills: [],
    });

    const userLevel = await new ReadSkillPreferencesUseCase(depsOf({ preferences })).execute(
      USER,
      null,
    );
    const folderLevel = await new ReadSkillPreferencesUseCase(depsOf({ preferences })).execute(
      USER,
      '/srv/projects/app',
    );

    expect(userLevel).toEqual({
      effective: { value: { sources: { user: true }, disabledSkills: [] }, from: 'user' },
      user: { sources: { user: true }, disabledSkills: [] },
      folder: null,
    });
    expect(folderLevel).toEqual({
      effective: {
        value: { sources: { system: true }, disabledSkills: [] },
        from: 'folder',
        folder: '/srv/projects/app',
      },
      user: { sources: { user: true }, disabledSkills: [] },
      folder: {
        folder: '/srv/projects/app',
        value: { sources: { system: true }, disabledSkills: [] },
      },
    });
  });

  it('refuses a folder outside the allowlist, and one of another user (S-161)', async () => {
    const useCase = new ReadSkillPreferencesUseCase(depsOf());

    await expect(useCase.execute(USER, '/elsewhere')).rejects.toThrow(WorkspaceNotAllowedError);
    await expect(useCase.execute(STRANGER, '/srv/projects/app')).rejects.toThrow(
      WorkspaceForbiddenError,
    );
  });
});
