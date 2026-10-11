import { describe, expect, it } from 'vitest';
import type { HookCallback, Options } from '@anthropic-ai/claude-agent-sdk';

import { assertSafeSdkOptions } from '@adapter/outbound/engines/claude/query.factory';
import {
  CLAUDE_CONFIG_FILES,
  CLAUDE_SECURITY_CONTRACT,
  claudeSecurityContract,
} from '@adapter/outbound/engines/claude/security-contract';

/** The guard of the product with one of its checks taken out — what a careless edit would leave. */
const weakened =
  (patch: Partial<Options>) =>
  (options: Options): unknown =>
    assertSafeSdkOptions({ ...options, ...patch });

/** The options the contract probed the guard with, first — those of a session. */
function probedSession(): Options {
  const probed: Options[] = [];
  claudeSecurityContract((options) => {
    probed.push(options);
    return assertSafeSdkOptions(options);
  }).assert();
  const [session] = probed;
  if (session === undefined) {
    throw new Error('the contract probed nothing');
  }
  return session;
}

/** The audit hook of [options] — the first of `PreToolUse`. */
function auditHookOf(options: Options): HookCallback {
  const hook = options.hooks?.PreToolUse?.[0]?.hooks[0];
  if (hook === undefined) {
    throw new Error('no audit hook');
  }
  return hook;
}

describe('the security contract of Claude — plan 28, B-35', () => {
  it('holds with the guard every session opens through', () => {
    expect(CLAUDE_SECURITY_CONTRACT.assert()).toEqual({ holds: true });
  });

  it('declares the settings and the servers of a folder as its configuration — S-103', () => {
    expect(CLAUDE_SECURITY_CONTRACT.configFiles).toEqual([
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.mcp.json',
    ]);
    expect(CLAUDE_SECURITY_CONTRACT.configFiles).toBe(CLAUDE_CONFIG_FILES);
  });

  it('fails every clause the guard keeps when the guard lets everything through', () => {
    expect(claudeSecurityContract(() => undefined).assert()).toEqual({
      holds: false,
      unmet: ['blockingGate', 'auditBeforeTool', 'noSelfApproval', 'credentialsOutside'],
    });
  });

  it('fails them too when the guard refuses even the options of a session — it proves nothing', () => {
    const refusesAll = (): never => {
      throw new Error('refused');
    };

    expect(claudeSecurityContract(refusesAll).assert()).toEqual({
      holds: false,
      unmet: ['blockingGate', 'auditBeforeTool', 'noSelfApproval', 'credentialsOutside'],
    });
  });

  it('names the one clause a guard that forgets the setting sources breaks', () => {
    expect(claudeSecurityContract(weakened({ settingSources: ['project'] })).assert()).toEqual({
      holds: false,
      unmet: ['noSelfApproval'],
    });
  });

  it('names the one clause a guard that forgets the environment breaks', () => {
    expect(claudeSecurityContract(weakened({ env: {} })).assert()).toEqual({
      holds: false,
      unmet: ['credentialsOutside'],
    });
  });

  it('probes with a session that allows nothing: its callback refuses, its hook only lets through', async () => {
    const session = probedSession();
    const signal = new AbortController().signal;

    expect(session.cwd).toBe('/probe/folder');
    expect(session.stderr?.('nothing is read')).toBeUndefined();
    await expect(
      session.canUseTool?.('Bash', {}, { signal, toolUseID: 't', requestId: 'r' } as never),
    ).resolves.toMatchObject({ behavior: 'deny' });
    await expect(auditHookOf(session)({} as never, undefined, { signal })).resolves.toEqual({
      continue: true,
    });
  });

  it('names the gate and the trail for a guard that forgets the callback and the hook', () => {
    const forgetful = weakened({
      canUseTool: () => Promise.resolve({ behavior: 'deny', message: 'x' }),
      hooks: { PreToolUse: [{ hooks: [() => Promise.resolve({ continue: true })] }] },
    });

    expect(claudeSecurityContract(forgetful).assert()).toEqual({
      holds: false,
      unmet: ['blockingGate', 'auditBeforeTool'],
    });
  });
});
