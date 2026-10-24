import { describe, expect, it } from 'vitest';

import type { FolderAccess } from '@application/agent-settings';
import { ClaudeInstallationCatalog, ReadProjectConfigUseCase } from '@application/engines/claude';
import type {
  InstallationFacts,
  LiveLoadedState,
  ProjectConfigDependencies,
  ProjectConfigFileRead,
  ProjectConfigSource,
} from '@application/engines/claude';
import { UserId } from '@domain/auth';
import type { ClaudeInitialization } from '@domain/engines/claude';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../../../../support/fakes/fixed-clock';

const USER = UserId.create('auth|42');
const clock = new FixedClock(new Date('2026-10-09T12:00:00Z'));
const HOME_CONFIG_DIR = '/home/me/.claude';

const folders = (root = '/srv'): FolderAccess => ({
  resolve: (raw) => Promise.resolve(WorkspacePath.create(raw)),
  locate: (raw) => Promise.resolve({ folder: WorkspacePath.create(raw), root }),
  firstRoot: () => Promise.resolve(WorkspacePath.create(root)),
});

const facts = (): InstallationFacts => ({
  agentSdk: { version: '0.3.277', reason: null },
  bundledCli: { version: '2.1.277', reason: null },
  pathCli: () => Promise.resolve({ version: null, reason: 'notInstalled' }),
  configDir: { path: HOME_CONFIG_DIR, fromEnvironment: false },
});

const initWith = (partial: Partial<ClaudeInitialization>): ClaudeInitialization => ({
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
  ...partial,
});

const catalogOf = (init: ClaudeInitialization) =>
  new ClaudeInstallationCatalog(
    { initializationOf: () => Promise.resolve(null) },
    { probe: () => Promise.resolve({ cliVersion: '2.1.277', initialization: init }) },
    clock,
    { cliVersion: '2.1.277', configDir: HOME_CONFIG_DIR },
  );

const EMPTY_FILE_READ: ProjectConfigFileRead = {
  memoryFiles: {},
  commandFiles: [],
  agentFiles: [],
  outputStyleFiles: [],
  hooks: [],
  permissions: { allow: [], deny: [] },
  plugins: { enabled: [], disabled: [], enableAllProjectMcpServers: false },
  issues: [],
};

const sourceOf = (fileRead: Partial<ProjectConfigFileRead> = {}): ProjectConfigSource => ({
  read: () => Promise.resolve({ ...EMPTY_FILE_READ, ...fileRead }),
});

const liveLoadedStateOf = (paths: readonly string[] | null = null): LiveLoadedState => ({
  loadedMemoryFiles: () => Promise.resolve(paths),
});

function depsOf(overrides: Partial<ProjectConfigDependencies> = {}): ProjectConfigDependencies {
  return {
    folders: folders(),
    catalog: catalogOf(initWith({})),
    source: sourceOf(),
    liveLoadedState: liveLoadedStateOf(),
    facts: facts(),
    ...overrides,
  };
}

describe('ReadProjectConfigUseCase — plan 13, B-31', () => {
  it('lists the memory chain, by the rule, with nothing confirmed when there is no live session (S-148)', async () => {
    const view = await new ReadProjectConfigUseCase(depsOf()).execute(USER, '/srv/app');

    const originOf = (origin: string) => view.memory.find((file) => file.origin === origin)!;
    expect(originOf('root').loadedByRule).toBe(true);
    expect(originOf('claudeDir').loadedByRule).toBe(true);
    expect(originOf('local').loadedByRule).toBe(false);
    expect(originOf('user').loadedByRule).toBe(false);
    expect(originOf('user').path).toBe('/home/me/.claude/CLAUDE.md');
    for (const file of view.memory) {
      expect(file.loadedConfirmed).toBeNull();
      expect(file.diverges).toBe(false);
    }
  });

  it('includes ancestors up to the allowlist root, never past it (S-148)', async () => {
    const view = await new ReadProjectConfigUseCase(depsOf({ folders: folders('/srv') })).execute(
      USER,
      '/srv/a/b',
    );

    const ancestorPaths = view.memory
      .filter((file) => file.origin === 'ancestor')
      .map((file) => file.path);
    expect(ancestorPaths).toContain('/srv/a/CLAUDE.md');
    expect(ancestorPaths).toContain('/srv/CLAUDE.md');
    expect(ancestorPaths).not.toContain('/CLAUDE.md');
  });

  it('marks exists/size/modified from whatever the reader found at that path', async () => {
    const view = await new ReadProjectConfigUseCase(
      depsOf({
        source: sourceOf({
          memoryFiles: {
            '/srv/app/CLAUDE.md': {
              exists: true,
              sizeBytes: 128,
              modifiedAt: '2026-10-01T00:00:00.000Z',
            },
          },
        }),
      }),
    ).execute(USER, '/srv/app');

    const root = view.memory.find((file) => file.origin === 'root');
    expect(root).toMatchObject({
      exists: true,
      sizeBytes: 128,
      modifiedAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('confirms memory load from a live session, and flags a divergence from the rule (S-148)', async () => {
    const view = await new ReadProjectConfigUseCase(
      depsOf({ liveLoadedState: liveLoadedStateOf(['/srv/app/CLAUDE.local.md']) }),
    ).execute(USER, '/srv/app');

    const root = view.memory.find((file) => file.origin === 'root')!;
    const local = view.memory.find((file) => file.origin === 'local')!;
    expect(root.loadedConfirmed).toBe(false);
    expect(root.diverges).toBe(true); // rule said loads, live session disagrees
    expect(local.loadedConfirmed).toBe(true);
    expect(local.diverges).toBe(true); // rule said it never loads, live session disagrees
  });

  it('lists project commands without the engine’s builtin ones, with the project file when there is one (S-151)', async () => {
    const view = await new ReadProjectConfigUseCase(
      depsOf({
        catalog: catalogOf(
          initWith({
            commands: [
              {
                name: 'help',
                description: 'built-in',
                argumentHint: '',
                aliases: [],
                builtin: true,
              },
              { name: 'review', description: 'review a PR', argumentHint: '<pr>', aliases: [] },
            ],
          }),
        ),
        source: sourceOf({
          commandFiles: [{ name: 'review', relativePath: '.claude/commands/review.md' }],
        }),
      }),
    ).execute(USER, '/srv/app');

    expect(view.commands).toEqual([
      {
        name: 'review',
        description: 'review a PR',
        argumentHint: '<pr>',
        sourceFile: '.claude/commands/review.md',
        shadowed: false,
      },
    ]);
  });

  it('flags a project command that shares a name with a builtin one (shadowed)', async () => {
    const view = await new ReadProjectConfigUseCase(
      depsOf({
        catalog: catalogOf(
          initWith({
            commands: [
              {
                name: 'usage',
                description: 'built-in',
                argumentHint: '',
                aliases: [],
                builtin: true,
              },
              { name: 'usage', description: 'project override', argumentHint: '', aliases: [] },
            ],
          }),
        ),
      }),
    ).execute(USER, '/srv/app');

    expect(view.commands).toEqual([
      expect.objectContaining({ name: 'usage', shadowed: true, sourceFile: null }),
    ]);
  });

  it('lists subagents with the source file and the risks its frontmatter declared (S-175, S-176)', async () => {
    const view = await new ReadProjectConfigUseCase(
      depsOf({
        catalog: catalogOf(
          initWith({ agents: [{ name: 'writer', description: 'writes code', model: null }] }),
        ),
        source: sourceOf({
          agentFiles: [
            {
              name: 'writer',
              relativePath: '.claude/agents/writer.md',
              permissionMode: 'acceptEdits',
              tools: undefined,
              mcpServers: undefined,
            },
          ],
        }),
      }),
    ).execute(USER, '/srv/app');

    expect(view.agents).toEqual([
      {
        name: 'writer',
        description: 'writes code',
        model: null,
        sourceFile: '.claude/agents/writer.md',
        risks: ['permissionMode'],
      },
    ]);
  });

  it('lists an agent the catalogue offers with no matching file as having no risks and no source', async () => {
    const view = await new ReadProjectConfigUseCase(
      depsOf({
        catalog: catalogOf(
          initWith({ agents: [{ name: 'explorer', description: 'reads', model: null }] }),
        ),
      }),
    ).execute(USER, '/srv/app');

    expect(view.agents).toEqual([
      { name: 'explorer', description: 'reads', model: null, sourceFile: null, risks: [] },
    ]);
  });

  it('lists output styles from the installation and the project files, marking the current one (S-177)', async () => {
    const view = await new ReadProjectConfigUseCase(
      depsOf({
        catalog: catalogOf(
          initWith({ outputStyle: 'concise', outputStyles: ['default', 'concise'] }),
        ),
        source: sourceOf({
          outputStyleFiles: [{ name: 'concise', relativePath: '.claude/output-styles/concise.md' }],
        }),
      }),
    ).execute(USER, '/srv/app');

    expect(view.outputStyles).toEqual([
      { name: 'concise', current: true, sourceFile: '.claude/output-styles/concise.md' },
      { name: 'default', current: false, sourceFile: null },
    ]);
  });

  it('passes hooks, permissions and plugins straight through from the file reader (S-179…S-181)', async () => {
    const view = await new ReadProjectConfigUseCase(
      depsOf({
        source: sourceOf({
          hooks: [{ event: 'PreToolUse', matcher: 'Bash', command: 'echo hi' }],
          permissions: { allow: ['Bash(npm test)'], deny: ['Bash(rm -rf /)'] },
          plugins: { enabled: ['reviewer@team'], disabled: [], enableAllProjectMcpServers: true },
          issues: [{ path: '.claude/settings.json', reason: 'malformed' }],
        }),
      }),
    ).execute(USER, '/srv/app');

    expect(view.hooks).toEqual([{ event: 'PreToolUse', matcher: 'Bash', command: 'echo hi' }]);
    expect(view.permissions).toEqual([
      { rule: 'Bash(rm -rf /)', kind: 'deny', appliesHere: true },
      { rule: 'Bash(npm test)', kind: 'allow', appliesHere: false },
    ]);
    expect(view.plugins).toEqual({
      enabled: ['reviewer@team'],
      disabled: [],
      enableAllProjectMcpServers: true,
    });
    expect(view.issues).toEqual([{ path: '.claude/settings.json', reason: 'malformed' }]);
  });

  it('propagates the folder fence refusal untouched (S-142)', async () => {
    const refusing: FolderAccess = {
      resolve: () => Promise.reject(new Error('WORKSPACE_NOT_ALLOWED')),
      locate: () => Promise.reject(new Error('WORKSPACE_NOT_ALLOWED')),
      firstRoot: () => Promise.resolve(null),
    };

    await expect(
      new ReadProjectConfigUseCase(depsOf({ folders: refusing })).execute(USER, '/elsewhere'),
    ).rejects.toThrow('WORKSPACE_NOT_ALLOWED');
  });
});
