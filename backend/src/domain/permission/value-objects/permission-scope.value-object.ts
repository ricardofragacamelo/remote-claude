/**
 * How far a decision reaches.
 *
 * Four values, and the contract carries the same four. Only two of them exist in this plan: a rule
 * that outlives the session needs a screen to revoke it, and that screen belongs to the rules plan
 * — see docs/plans/01-live-session/F4-permission.md.
 */
export const PERMISSION_SCOPES = ['once', 'session', 'project', 'always'] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

/**
 * The scopes that die with the session, and therefore the ones this build honours.
 *
 * `once` leaves nothing behind; `session` leaves a rule in memory that goes when the subprocess
 * does. Neither can grant anything tomorrow, which is what makes them safe to ship before the
 * screen that revokes a rule exists.
 */
export const LIVE_PERMISSION_SCOPES = ['once', 'session'] as const;

export type LivePermissionScope = (typeof LIVE_PERMISSION_SCOPES)[number];

/**
 * Whether this build can honour a scope.
 *
 * A scope it cannot honour is **not** silently downgraded to `once`: a person who tapped "always"
 * and got "just this once" has been told something untrue about what they authorised. The caller
 * refuses instead.
 */
export function isLivePermissionScope(scope: string): scope is LivePermissionScope {
  return (LIVE_PERMISSION_SCOPES as readonly string[]).includes(scope);
}
