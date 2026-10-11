/**
 * The six clauses every engine adapter keeps (ADR-011, rewritten as the contract of every engine by
 * plan 28, B-35 — discovery 03 §6.6):
 *
 * - `blockingGate` — every tool waits on the `SessionPermissionGate`, and no "approve everything" of
 *   the engine is reachable by configuration;
 * - `auditBeforeTool` — the trail is written through the `ToolInvocationRecorder` before the tool
 *   runs;
 * - `noSelfApproval` — the engine's own user configuration, "always allow" lists, trusted folders
 *   and permanent approvals are off or isolated;
 * - `folderScope` — the engine works in the open folder, which has already cleared the allowlist;
 * - `credentialsOutside` — the engine's credential never passes through the backend: not in a log,
 *   the contract or the database, and the backend's own configuration never reaches the engine;
 * - `configSensitive` — the engine's configuration files join the sensitive files.
 */
export const SECURITY_CLAUSES = [
  'blockingGate',
  'auditBeforeTool',
  'noSelfApproval',
  'folderScope',
  'credentialsOutside',
  'configSensitive',
] as const;

export type SecurityClause = (typeof SECURITY_CLAUSES)[number];

/** What an adapter's assertion found: the contract holds, or the clauses it could not prove. */
export type SecurityAssertion =
  { readonly holds: true } | { readonly holds: false; readonly unmet: readonly SecurityClause[] };

/**
 * How one engine adapter keeps the contract.
 *
 * The assertion runs when the engine is registered, and again — in the adapter's own terms — at the
 * point a session opens: an engine whose assertion fails at registration is `unavailable` with
 * {@link SECURITY_UNMET_REASON}, and the other engines start as usual (S-102).
 */
export interface EngineSecurityContract {
  /**
   * The files, relative to the open folder, that change what the engine may do — its settings, the
   * servers it starts. They join the sensitive files of every folder (clause `configSensitive`,
   * S-103), whether the engine is enabled or not: the configuration of an engine that is off is
   * still a file another agent can rewrite.
   */
  readonly configFiles: readonly string[];

  /** Checks every clause the adapter can check without opening a session. Never spawns anything. */
  assert(): SecurityAssertion;
}

/** The reason of an engine whose assertion failed — a key the client translates. */
export const SECURITY_UNMET_REASON = 'engine.error.securityUnmet';
