/**
 * How far a decision reaches.
 *
 * Four values, and the contract carries the same four:
 *
 * | Scope | Leaves behind |
 * |---|---|
 * | `once` | nothing |
 * | `session` | a rule in memory, gone with the subprocess |
 * | `project` | a persisted rule, for every session of this person in that project |
 * | `always` | a persisted rule, for every session of this person anywhere |
 *
 * The last two outlive the session, which is why they exist only alongside the way of revoking
 * them — see docs/plans/03-rules-and-audit/F0-rules.md.
 */
export const PERMISSION_SCOPES = ['once', 'session', 'project', 'always'] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

/**
 * The scopes whose rule is written to the database, because it has to survive the process.
 *
 * A `session` rule stays in memory on purpose: what goes to the database is what has to outlive
 * the subprocess, and a session rule is defined by not doing that.
 */
export const PERSISTED_PERMISSION_SCOPES = ['project', 'always'] as const;

export type PersistedPermissionScope = (typeof PERSISTED_PERMISSION_SCOPES)[number];

/** Whether a string names one of the four scopes. */
export function isPermissionScope(scope: string): scope is PermissionScope {
  return (PERMISSION_SCOPES as readonly string[]).includes(scope);
}

/** Whether a scope's rule is persisted rather than kept in memory. */
export function isPersistedPermissionScope(scope: string): scope is PersistedPermissionScope {
  return (PERSISTED_PERMISSION_SCOPES as readonly string[]).includes(scope);
}
