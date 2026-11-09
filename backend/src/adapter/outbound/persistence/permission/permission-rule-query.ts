import { and, eq, gt, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { PermissionRuleListFilter } from '@application/permission';
import type { PermissionRuleStatus } from '@domain/permission';
import type { UserId } from '@domain/auth';
import { permissionRules } from '@infra/database/schema';
import { whenPresent } from '../query-logging';

/** What `status` the listing reads when the caller named none — never `revoked` nor `disabled`. */
export const DEFAULT_LIST_STATUSES: readonly PermissionRuleStatus[] = ['active', 'expired'];

/** `%`, `_` and `\` escaped, so `q` is read literally — never a wildcard (S-45). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `q`, matched against the pattern **and** the folder, case-insensitive (S-46). */
function likeCondition(q: string): SQL {
  const escaped = `%${escapeLike(q)}%`;

  return or(
    sql`${permissionRules.pattern} ILIKE ${escaped} ESCAPE '\\'`,
    sql`${permissionRules.projectPath} ILIKE ${escaped} ESCAPE '\\'`,
  )!;
}

/** The SQL `statusAt()` would read at [now], for one status — mirrors `PermissionRule.statusAt`. */
export function statusCondition(status: PermissionRuleStatus, now: Date): SQL {
  switch (status) {
    case 'revoked':
      return isNotNull(permissionRules.revokedAt);
    case 'disabled':
      return and(isNull(permissionRules.revokedAt), isNotNull(permissionRules.disabledReason))!;
    case 'expired':
      return and(
        isNull(permissionRules.revokedAt),
        isNull(permissionRules.disabledReason),
        lte(permissionRules.expiresAt, now),
      )!;
    case 'active':
      return and(
        isNull(permissionRules.revokedAt),
        isNull(permissionRules.disabledReason),
        gt(permissionRules.expiresAt, now),
      )!;
  }
}

/** Every condition [filter] names, scoped to [userId] — the predicate a listing and a summary share. */
export function filterConditions(
  userId: UserId,
  filter: PermissionRuleListFilter,
  now: Date,
): SQL[] {
  const statuses = filter.status.length === 0 ? DEFAULT_LIST_STATUSES : filter.status;
  const conditions: (SQL | null)[] = [
    eq(permissionRules.userId, userId.value),
    or(...statuses.map((status) => statusCondition(status, now)))!,
    whenPresent(filter.scope, (scope) => eq(permissionRules.scope, scope)),
    whenPresent(filter.decision, (decision) => eq(permissionRules.decision, decision)),
    whenPresent(filter.engine, (engine) => eq(permissionRules.engine, engine)),
    // The canonical kind is always the text before the pattern's optional `(...)` — the same rule
    // `RulePattern.kind` reads by, computed here instead of read back from it (S-44).
    whenPresent(
      filter.kind,
      (kind) => sql`split_part(${permissionRules.pattern}, '(', 1) = ${kind}`,
    ),
    whenPresent(filter.folder, (folder) => eq(permissionRules.projectPath, folder)),
    whenPresent(filter.expiresBefore, (expiresBefore) =>
      and(statusCondition('active', now), lt(permissionRules.expiresAt, expiresBefore))!,
    ),
    whenPresent(filter.q, (q) => likeCondition(q)),
  ];

  return conditions.filter((condition): condition is SQL => condition !== null);
}
