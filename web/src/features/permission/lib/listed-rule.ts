import type { ListedRule, PermissionRule } from '../types/rule';

/**
 * How close to its expiry a rule is flagged. Seven days, not thirty: with the default lifetime of
 * ninety, thirty would keep a third of every rule's life under a warning, and a permanent warning
 * is one nobody reads ([D-13](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1_000;

/**
 * Whether a rule that still answers stops doing so within the warning window.
 *
 * Written once, because the list and the screen of one rule must flag the same rules — a rule
 * warned about in one place and not the other is a warning nobody trusts.
 */
export function isExpiringSoon(rule: PermissionRule, now: number): boolean {
  return rule.status === 'active' && new Date(rule.expiresAt).getTime() - now < EXPIRY_WARNING_MS;
}

/** `always` before `project`, and each project's rules together — the list reads by reach. */
const SCOPE_ORDER = { always: 0, project: 1 } as const;

/**
 * The rules in the order the simple list shows them, each with its warning — sorted by reach and
 * then by project, keeping the server's order (newest first) inside each group.
 * `Array.prototype.sort` is stable, which is what makes "keeping" true.
 */
export function listedRules(rules: readonly PermissionRule[], now: number): readonly ListedRule[] {
  return [...rules]
    .sort(
      (a, b) =>
        SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
        (a.projectPath ?? '').localeCompare(b.projectPath ?? ''),
    )
    .map((rule) => ({ rule, expiringSoon: isExpiringSoon(rule, now) }));
}
