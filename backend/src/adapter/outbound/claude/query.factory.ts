import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import { isBackendVariable } from './claude-environment';
import { assertAllowed, UnsafeFlagSettingsError } from './flag-settings';

/**
 * How a `Query` comes into being.
 *
 * It exists so the runner can be handed a scripted stream in a test without anybody mocking a
 * module. The real one is one call; the scripted one lives in `backend/test/fakes/agent-sdk/` and
 * replays fixtures captured from real runs, never a stream somebody wrote from memory
 * ([D-04](../../../../../docs/plans/01-live-session/decisions.md)).
 */
export type QueryFactory = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: Options;
}) => Query;

/**
 * Raised when options that would silently disable the product reach the SDK.
 *
 * It is a programming error rather than a domain one: nothing a client sends can cause it, and the
 * only way to reach it is for our own code to have built the options wrong.
 */
export class UnsafeSdkOptionsError extends Error {
  constructor(missing: string) {
    super(`refusing to open a Claude session: ${missing}`);
    this.name = 'UnsafeSdkOptionsError';
  }
}

/**
 * The Agent SDK itself — and the last place anything can be stopped before a subprocess exists.
 *
 * The three settings are **checked and then written out here**, at the one point in the process
 * that actually reaches the SDK. Each is a setting whose absence turns a protection off in
 * silence: omitting `settingSources` loads the user scope and its personal `allow` rules, which
 * skip `canUseTool`; an absent `PreToolUse` hook leaves no trail of what was executed; and an
 * absent `canUseTool` hands the decision back to the CLI's own classification, so tools it
 * considers safe simply run. None of the three produces an error or a warning from the SDK — that
 * was measured, and it is why the check exists at all. See
 * docs/architecture/backend/04-claude-integration.md#a-armadilha-do-settingsources.
 *
 * The composition point still states all three (`session-runner.ts`), which is where a reviewer
 * reads them. This is the other half: the composition point *sets* them, and this *refuses* to proceed
 * without them, so no future caller of the port can reach the SDK past them. `pnpm scan:security`
 * reads this call, which is the only bare `query(` in the backend.
 *
 * A fourth check, of the same kind: **the environment**. An absent `env` makes the SDK hand the CLI
 * the backend's whole `process.env`, and an `env` that carries the backend's configuration gives
 * every `Bash` Claude runs the database password — both in silence
 * ([12 · D-10](../../../../../docs/plans/12-integrated-terminal/decisions.md)). The error names the
 * variables and never their values.
 *
 * And the doors of plan 13 (ADR-018), each of which a scanner reads and this refuses: no
 * `strictMcpConfig: true` starts the repository's own `.mcp.json`, its plugins and the claude.ai
 * connectors; a non-empty `mcpServers` puts the servers — and their secrets — on the argv, readable
 * in `/proc`; `managedSettings` was measured not to hold the shell inline off; a `settings` key
 * outside the allowlist reaches the layer above the user's and the project's; and a plugin without
 * `skipMcpDiscovery: true` starts its own MCP servers.
 */
export const realQueryFactory: QueryFactory = ({ prompt, options }) => {
  const hooks = options.hooks?.PreToolUse ?? [];

  assertProjectScopeOnly(options.settingSources);

  if (hooks.length === 0 || hooks.every((matcher) => matcher.hooks.length === 0)) {
    throw new UnsafeSdkOptionsError('hooks.PreToolUse must carry the audit hook');
  }

  if (typeof options.canUseTool !== 'function') {
    throw new UnsafeSdkOptionsError('canUseTool must be the permission bridge');
  }

  assertIsolatedEnvironment(options.env);
  assertComposedExtensions(options);

  return query({
    prompt,
    options: {
      ...options,
      settingSources: ['project'],
      strictMcpConfig: true,
      canUseTool: options.canUseTool,
      hooks: { ...options.hooks, PreToolUse: hooks },
    },
  });
};

/** The first check: the SDK reads the project's settings and nothing else. */
function assertProjectScopeOnly(settingSources: Options['settingSources']): void {
  if (settingSources?.length !== 1 || settingSources[0] !== 'project') {
    throw new UnsafeSdkOptionsError("settingSources must be exactly ['project']");
  }
}

/** The fourth check: an environment of its own, with none of the backend's configuration in it. */
function assertIsolatedEnvironment(env: Options['env']): void {
  if (env === undefined) {
    throw new UnsafeSdkOptionsError('env must be set, or the CLI inherits the whole backend');
  }

  const leaked = Object.keys(env).filter(isBackendVariable);
  if (leaked.length > 0) {
    throw new UnsafeSdkOptionsError(
      `env must not carry the backend configuration (${leaked.join(', ')})`,
    );
  }
}

/** The fifth check: only what the backend composed reaches the session (ADR-018). */
function assertComposedExtensions(options: Options): void {
  assertComposedServers(options);
  assertFlagLayer(options);

  if ((options.plugins ?? []).some((plugin) => plugin.skipMcpDiscovery !== true)) {
    throw new UnsafeSdkOptionsError('every plugin must carry skipMcpDiscovery: true');
  }
}

/** Strict, and no server on the argv: they arrive through `setMcpServers()` (plan 13, D-02). */
function assertComposedServers(options: Options): void {
  if (options.strictMcpConfig !== true) {
    throw new UnsafeSdkOptionsError('strictMcpConfig must be true');
  }

  if (options.mcpServers !== undefined && Object.keys(options.mcpServers).length > 0) {
    throw new UnsafeSdkOptionsError(
      'mcpServers must be empty — servers go through setMcpServers(), never the argv',
    );
  }
}

/** The flag layer from its builder, and never the policy tier (plan 13, D-24). */
function assertFlagLayer(options: Options): void {
  if ('managedSettings' in options && options['managedSettings'] !== undefined) {
    throw new UnsafeSdkOptionsError('managedSettings is never used');
  }

  if (typeof options.settings === 'string') {
    throw new UnsafeSdkOptionsError('settings must be built by flagSettings(), never a file');
  }

  try {
    assertAllowed(Object.keys(options.settings ?? {}));
  } catch (error) {
    throw new UnsafeSdkOptionsError(
      error instanceof UnsafeFlagSettingsError ? error.message : 'settings refused',
    );
  }
}

export const QUERY_FACTORY = Symbol('QueryFactory');
