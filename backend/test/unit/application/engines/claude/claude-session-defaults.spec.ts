import { describe, expect, it } from 'vitest';

import { ClaudeSessionDefaults } from '@application/engines/claude';
import { ClaudeInstallationCatalog } from '@application/engines/claude';
import type {
  OutputStyleDefaultsRepository,
  ProjectCommandFile,
  ProjectSkillFiles,
  SkillPluginCandidateSet,
  SkillPluginCandidates,
  SkillPreferencesRepository,
} from '@application/engines/claude';
import { UserId } from '@domain/auth';
import type {
  ClaudeInitialization,
  OutputStyleDefaults,
  SkillPreferencesDefaults,
} from '@domain/engines/claude';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../../../../support/fakes/fixed-clock';

const USER = UserId.create('auth|session-owner');
const FOLDER = WorkspacePath.create('/srv/projects/app');
const clock = new FixedClock(new Date('2026-10-24T12:00:00Z'));

const EMPTY_INITIALIZATION: ClaudeInitialization = {
  commands: [],
  agents: [],
  models: [],
  outputStyle: 'default',
  outputStyles: ['default', 'Concise'],
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

function catalogOf(initialization: ClaudeInitialization): ClaudeInstallationCatalog {
  const catalog = new ClaudeInstallationCatalog(
    { initializationOf: () => Promise.resolve(null) },
    { probe: () => Promise.resolve({ cliVersion: '2.1.277', initialization }) },
    clock,
    { cliVersion: '2.1.277', configDir: '/home/me/.claude' },
  );
  return catalog;
}

function stylesOf(
  stored: OutputStyleDefaults = { user: null, overrides: [] },
): OutputStyleDefaultsRepository {
  return {
    read: () => Promise.resolve(stored),
    save: () => Promise.resolve(),
    remove: () => Promise.resolve(false),
  };
}

function skillPreferencesOf(
  stored: SkillPreferencesDefaults = { user: null, overrides: [] },
): SkillPreferencesRepository {
  return { read: () => Promise.resolve(stored), save: () => Promise.resolve() };
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

describe('ClaudeSessionDefaults — plan 13, B-15, B-34', () => {
  it('asks the catalogue known for the folder — never a probe — for the output style (S-53)', async () => {
    const defaults = new ClaudeSessionDefaults(
      'claude',
      stylesOf({ user: 'Concise', overrides: [] }),
      skillPreferencesOf(),
      catalogOf(EMPTY_INITIALIZATION),
      projectSkillFilesOf(),
      skillPluginsOf(),
    );

    // The catalogue has nothing known for this folder yet (no probe, no live session asked it) —
    // the output style still applies, offered or not (S-53's own "drop nothing while not known").
    const options = await defaults.optionsFor(USER, FOLDER);

    expect(options.outputStyle).toBe('Concise');
    expect(options.stale).toEqual([]);
  });

  it('omits `skills` when nothing is offered is disabled (S-155)', async () => {
    const defaults = new ClaudeSessionDefaults(
      'claude',
      stylesOf(),
      skillPreferencesOf({ user: { sources: { user: true }, disabledSkills: [] }, overrides: [] }),
      catalogOf(EMPTY_INITIALIZATION),
      projectSkillFilesOf([{ name: 'review', relativePath: '.claude/skills/review/SKILL.md' }]),
      skillPluginsOf({ included: ['draft'], excludedForHook: [] }),
    );

    const options = await defaults.optionsFor(USER, FOLDER);

    expect(options.skills).toBeUndefined();
  });

  it('narrows `skills` to what the safety default leaves on — user and system off (S-156)', async () => {
    const defaults = new ClaudeSessionDefaults(
      'claude',
      stylesOf(),
      skillPreferencesOf(),
      catalogOf(EMPTY_INITIALIZATION),
      projectSkillFilesOf([{ name: 'review', relativePath: '.claude/skills/review/SKILL.md' }]),
      skillPluginsOf({ included: ['draft'], excludedForHook: [] }),
    );

    const options = await defaults.optionsFor(USER, FOLDER);

    expect(options.skills).toEqual(['review']);
  });

  it('qualifies a system skill by its own plugin name when composing the allowlist', async () => {
    const defaults = new ClaudeSessionDefaults(
      'claude',
      stylesOf(),
      skillPreferencesOf({
        user: {
          sources: { system: true },
          disabledSkills: ['remote-claude-system:blocked'],
        },
        overrides: [],
      }),
      catalogOf(EMPTY_INITIALIZATION),
      projectSkillFilesOf(),
      skillPluginsOf(EMPTY_CANDIDATES, {
        included: ['deploy', 'blocked'],
        excludedForHook: [],
      }),
    );

    const options = await defaults.optionsFor(USER, FOLDER);

    expect(options.skills).toEqual(['remote-claude-system:deploy']);
  });
});
