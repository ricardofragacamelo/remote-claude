import type { HookCallback, Options } from '@anthropic-ai/claude-agent-sdk';

import { SECURITY_CLAUSES } from '@application/session';
import type {
  EngineSecurityContract,
  SecurityAssertion,
  SecurityClause,
} from '@application/session';
import { PERMISSION_MODES } from '@domain/engine';
import { WorkspacePath } from '@domain/workspace';
import { claudeEnvironment } from './claude-environment';
import { assertSafeSdkOptions } from './query.factory';
import { buildSdkOptions } from './sdk-options.factory';
import type { SdkOptionsInput } from './sdk-options.factory';

/**
 * The files of a folder that change what Claude may do: a project `allow` rule goes past
 * `canUseTool` in a trusted folder, a hook there is code the next session runs, and `.mcp.json`
 * names servers ([07 · D-15](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-15--arquivos-que-mudam-a-permissão)).
 * Relative to the open folder, because that is where Claude reads a project's settings from.
 */
export const CLAUDE_CONFIG_FILES = [
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.mcp.json',
] as const;

/** The guard every session opens through — `assertSafeSdkOptions`, unless a test weakens it. */
export type SdkOptionsGuard = (options: Options) => unknown;

/** The folder the probe describes a session in. Nothing is opened there, and nothing is read. */
const PROBE_FOLDER = '/probe/folder';

/** A variable of the backend's own configuration, which must never reach the CLI. */
const BACKEND_VARIABLE = 'DATABASE_URL';

/** The audit hook of the probe: it is never called, only checked to be there. */
const probeHook: HookCallback = () => Promise.resolve({ continue: true });

/**
 * The options a session of Claude opens with, as the runner states them: the factory's, and the
 * three the call site writes literally (`session-runner.ts`) — nothing is spawned to build them.
 */
function sessionOptions(overrides: Partial<SdkOptionsInput> = {}): Options {
  return {
    ...buildSdkOptions({
      workspace: WorkspacePath.create(PROBE_FOLDER),
      model: null,
      permissionMode: 'ask',
      conversation: { claudeSessionId: 'probe', resumedFrom: null },
      limits: { maxBudgetUsd: 1, maxTurns: 1 },
      abortController: new AbortController(),
      environment: claudeEnvironment({ PATH: '/usr/bin', [BACKEND_VARIABLE]: 'postgres://probe' }),
      onStderr: () => undefined,
      ...overrides,
    }),
    settingSources: ['project'],
    canUseTool: () => Promise.resolve({ behavior: 'deny', message: 'probe' }),
    hooks: { PreToolUse: [{ hooks: [probeHook] }] },
  };
}

/** [options] without the option [name] — what a call site that forgot it would hand the SDK. */
function without(options: Options, name: keyof Options): Options {
  return Object.fromEntries(Object.entries(options).filter(([key]) => key !== name)) as Options;
}

/** Whether [guard] lets [options] through. */
function accepts(guard: SdkOptionsGuard, options: Options): boolean {
  try {
    guard(options);
    return true;
  } catch {
    return false;
  }
}

/** Whether [guard] lets a session's own options through and refuses every one of [unsafe]. */
function discriminates(guard: SdkOptionsGuard, unsafe: readonly Options[]): boolean {
  return accepts(guard, sessionOptions()) && unsafe.every((options) => !accepts(guard, options));
}

/** No option auto-approves a tool, and no canonical mode reaches the SDK as one that skips it. */
function nothingSkipsTheCallback(safe: Options): boolean {
  return (
    safe.allowDangerouslySkipPermissions === false &&
    !('allowedTools' in safe) &&
    PERMISSION_MODES.every(
      (mode) => sessionOptions({ permissionMode: mode }).permissionMode !== 'bypassPermissions',
    )
  );
}

/** The environment of a session carries none of the backend's configuration. */
function isolatedEnvironment(safe: Options): boolean {
  return safe.env !== undefined && !(BACKEND_VARIABLE in safe.env);
}

/**
 * How Claude keeps each clause that can be proved without a session — one check per clause, over
 * the options a session opens with ([safe]) and the guard it opens through.
 */
const CHECKS: Readonly<Record<SecurityClause, (guard: SdkOptionsGuard, safe: Options) => boolean>> =
  {
    // `canUseTool` is required, and nothing skips it — Permitir tudo is ours (ADR-022).
    blockingGate: (guard, safe) =>
      discriminates(guard, [without(safe, 'canUseTool')]) && nothingSkipsTheCallback(safe),
    // The `PreToolUse` hook is required: it writes the trail and may refuse the tool.
    auditBeforeTool: (guard, safe) =>
      discriminates(guard, [
        { ...safe, hooks: {} },
        { ...safe, hooks: { PreToolUse: [{ hooks: [] }] } },
      ]),
    // `settingSources: ['project']` and nothing else: the user scope carries personal `allow` rules
    // that skip `canUseTool`. The trust mark of the folder is cleared at every session open, by the
    // runner, because the SDK skips `canUseTool` in a trusted folder (measured).
    noSelfApproval: (guard, safe) =>
      discriminates(guard, [
        without(safe, 'settingSources'),
        { ...safe, settingSources: ['user', 'project'] },
      ]),
    folderScope: (_guard, safe) => safe.cwd === PROBE_FOLDER,
    // The CLI keeps its own login; the backend's configuration never reaches it.
    credentialsOutside: (guard, safe) =>
      isolatedEnvironment(safe) &&
      discriminates(guard, [
        without(safe, 'env'),
        { ...safe, env: { ...safe.env, [BACKEND_VARIABLE]: 'postgres://probe' } },
      ]),
    configSensitive: () => CLAUDE_CONFIG_FILES.length > 0,
  };

/**
 * The security contract of the engine `claude` (plan 28, B-35; ADR-011).
 *
 * The assertion proves, at registration, that the guard every session opens through
 * (`realQueryFactory`) still refuses what would switch a protection off in silence — and that the
 * options a session is built with pass it. The guard runs again at every session open; this is the
 * boot's copy of it, so an engine whose guard was weakened is `unavailable` before anybody opens a
 * session on it.
 *
 * @param guard the guard to prove — the product's own, unless a test hands a weakened one
 */
export function claudeSecurityContract(
  guard: SdkOptionsGuard = assertSafeSdkOptions,
): EngineSecurityContract {
  return {
    configFiles: CLAUDE_CONFIG_FILES,
    assert: (): SecurityAssertion => {
      const safe = sessionOptions();
      const unmet = SECURITY_CLAUSES.filter((clause) => !CHECKS[clause](guard, safe));
      return unmet.length === 0 ? { holds: true } : { holds: false, unmet };
    },
  };
}

/** The contract of the product, with its own guard. */
export const CLAUDE_SECURITY_CONTRACT = claudeSecurityContract();
