import { describe, expect, it } from 'vitest';

import { buildSdkOptions } from '@adapter/outbound/claude/sdk-options.factory';
import type { SdkOptionsInput } from '@adapter/outbound/claude/sdk-options.factory';
import { WorkspacePath } from '@domain/workspace';

/** A conversation minted here, and one begun elsewhere. */
const NEW = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
const SOURCE = '0f0e0d0c-0b0a-4908-8706-050403020100';

const input = (overrides: Partial<SdkOptionsInput> = {}): SdkOptionsInput => ({
  workspace: WorkspacePath.create('/srv/projects/app'),
  model: null,
  permissionMode: 'default',
  conversation: { claudeSessionId: NEW, resumedFrom: null },
  limits: { maxBudgetUsd: 10, maxTurns: 100 },
  abortController: new AbortController(),
  environment: { PATH: '/usr/bin', REMOTE_CLAUDE_OWNER: 'remote-claude-backend' },
  onStderr: () => undefined,
  ...overrides,
});

describe('buildSdkOptions', () => {
  it('starts the subprocess with the environment it was given, mark included — B-03', () => {
    expect(buildSdkOptions(input()).env).toEqual({
      PATH: '/usr/bin',
      REMOTE_CLAUDE_OWNER: 'remote-claude-backend',
      CLAUDE_CODE_ENABLE_TODO_TOOLS: '1',
    });
  });

  it('turns the task list on for every model, and leaves which tool keeps it to the environment — plan 08, D-25', () => {
    const env = buildSdkOptions(
      input({
        environment: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '0', CLAUDE_CODE_ENABLE_TASKS: '0' },
      }),
    ).env;

    expect(env).toMatchObject({
      CLAUDE_CODE_ENABLE_TODO_TOOLS: '1',
      CLAUDE_CODE_ENABLE_TASKS: '0',
    });
  });

  it('runs in the workspace, which is what `cwd` means here', () => {
    expect(buildSdkOptions(input()).cwd).toBe('/srv/projects/app');
  });

  it('never skips permissions, and never reads that from configuration', () => {
    // It would switch off `canUseTool`, which is the product. A flag like that ends up on.
    expect(buildSdkOptions(input()).allowDangerouslySkipPermissions).toBe(false);
  });

  it('never sets `allowedTools` — D-14', () => {
    // A bare tool name there auto-approves the tool before the callback is consulted, and the SDK
    // only says so on `stderr`. Narrowing the set is `disallowedTools`, which excuses nobody.
    expect(buildSdkOptions(input()).allowedTools).toBeUndefined();
  });

  it('leaves `settingSources` and the hooks to the call site', () => {
    // Both are stated in `session-runner.ts`, because `pnpm scan:security` reads them out of the
    // arguments of the `query(` call — the one place a reviewer and a scanner both look. A factory
    // that set them would satisfy the type and hide them from both.
    const options = buildSdkOptions(input());

    expect(options.settingSources).toBeUndefined();
    expect(options.hooks).toBeUndefined();
  });

  it('takes only the MCP servers the backend composes, and none on the argv — ADR-018', () => {
    const options = buildSdkOptions(input());

    expect(options.strictMcpConfig).toBe(true);
    expect(options.mcpServers).toEqual({});
  });

  it('switches the shell inline off, and carries the output style a default chose — plan 13, D-24', () => {
    expect(buildSdkOptions(input()).settings).toEqual({ disableSkillShellExecution: true });
    expect(buildSdkOptions(input({ outputStyle: 'Explanatory' })).settings).toEqual({
      disableSkillShellExecution: true,
      outputStyle: 'Explanatory',
    });
  });

  it('asks for partial messages, so the UI is not stuck on "thinking"', () => {
    expect(buildSdkOptions(input()).includePartialMessages).toBe(true);
  });

  it('asks for hook events, which is how the trail and the checkpoints arrive', () => {
    expect(buildSdkOptions(input()).includeHookEvents).toBe(true);
  });

  it('persists the session, because the transcript is shared with the editor', () => {
    expect(buildSdkOptions(input()).persistSession).toBe(true);
  });

  it("keeps file checkpointing on, which is the user's own /rewind", () => {
    expect(buildSdkOptions(input()).enableFileCheckpointing).toBe(true);
  });

  it('carries the configured limits', () => {
    const options = buildSdkOptions(input({ limits: { maxBudgetUsd: 3, maxTurns: 7 } }));

    expect(options.maxBudgetUsd).toBe(3);
    expect(options.maxTurns).toBe(7);
  });

  it('carries the abort controller, so the session can be torn down', () => {
    const abortController = new AbortController();

    expect(buildSdkOptions(input({ abortController })).abortController).toBe(abortController);
  });

  it('reads stderr rather than dropping it', () => {
    // It is the only channel on which the SDK reports that our own options shadowed the callback.
    const seen: string[] = [];
    buildSdkOptions(input({ onStderr: (data) => seen.push(data) })).stderr?.('boom');

    expect(seen).toEqual(['boom']);
  });

  it('carries the permission mode it was given', () => {
    expect(buildSdkOptions(input({ permissionMode: 'plan' })).permissionMode).toBe('plan');
  });

  it('opens Permitir tudo as `default`, with the approval still on — plan 23, S-06', () => {
    // The mode is ours: the CLI keeps calling `canUseTool`, and nothing skips it.
    const options = buildSdkOptions(input({ permissionMode: 'allowAll' }));

    expect(options.permissionMode).toBe('default');
    expect(options.allowDangerouslySkipPermissions).toBe(false);
  });

  describe('what it leaves out when it was given nothing', () => {
    it('omits the model, so the installation default applies', () => {
      expect('model' in buildSdkOptions(input())).toBe(false);
    });

    it('omits the resume, so the session starts fresh', () => {
      expect('resume' in buildSdkOptions(input())).toBe(false);
      expect('forkSession' in buildSdkOptions(input())).toBe(false);
    });

    it('sets the model when one was asked for', () => {
      expect(buildSdkOptions(input({ model: 'claude-opus-5' })).model).toBe('claude-opus-5');
    });
  });

  describe('which conversation it is — plan 04, D-04', () => {
    it('names a new conversation with the id recorded as ours — S-71', () => {
      expect(buildSdkOptions(input()).sessionId).toBe(NEW);
    });

    it('continues one of ours in its own file, under the id it has — S-59', () => {
      // The SDK refuses `sessionId` next to `resume` unless forking: a resume in place continues a
      // file that already has a name.
      const options = buildSdkOptions(
        input({ conversation: { claudeSessionId: SOURCE, resumedFrom: SOURCE } }),
      );

      expect(options.resume).toBe(SOURCE);
      expect('sessionId' in options).toBe(false);
      expect('forkSession' in options).toBe(false);
    });

    it('forks one begun elsewhere under an id of ours, never writing into it — S-58', () => {
      const options = buildSdkOptions(
        input({ conversation: { claudeSessionId: NEW, resumedFrom: SOURCE } }),
      );

      expect(options).toMatchObject({ resume: SOURCE, forkSession: true, sessionId: NEW });
    });
  });

  it('asks for summarised thinking and the text of subagents — plan 08, D-17 and D-15', () => {
    expect(buildSdkOptions(input())).toMatchObject({
      thinking: { type: 'adaptive', display: 'summarized' },
      forwardSubagentText: true,
    });
  });
});
