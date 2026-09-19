import { describe, expect, it } from 'vitest';

import { buildSdkOptions } from '@adapter/outbound/claude/sdk-options.factory';
import type { SdkOptionsInput } from '@adapter/outbound/claude/sdk-options.factory';
import { WorkspacePath } from '@domain/workspace';

const input = (overrides: Partial<SdkOptionsInput> = {}): SdkOptionsInput => ({
  workspace: WorkspacePath.create('/srv/projects/app'),
  model: null,
  permissionMode: 'default',
  resumeSessionId: null,
  limits: { maxBudgetUsd: 10, maxTurns: 100 },
  abortController: new AbortController(),
  onStderr: () => undefined,
  ...overrides,
});

describe('buildSdkOptions', () => {
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

  describe('what it leaves out when it was given nothing', () => {
    it('omits the model, so the installation default applies', () => {
      expect('model' in buildSdkOptions(input())).toBe(false);
    });

    it('omits the resume, so the session starts fresh', () => {
      expect('resume' in buildSdkOptions(input())).toBe(false);
    });

    it('sets the model when one was asked for', () => {
      expect(buildSdkOptions(input({ model: 'claude-opus-5' })).model).toBe('claude-opus-5');
    });

    it('sets the resume when one was asked for', () => {
      expect(buildSdkOptions(input({ resumeSessionId: 'sdk-7' })).resume).toBe('sdk-7');
    });
  });
});
