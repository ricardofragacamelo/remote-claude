import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { auditColumns } from './columns';

/**
 * The `permission_rules` table: authorisations given in advance, that outlive a session.
 *
 * Only `project` and `always` are here. A `session` rule lives in memory and dies with the
 * subprocess — what goes to the database is what has to survive the process.
 *
 * A rule is never deleted: revoking writes `revoked_at` and keeps the row, because the history of
 * requests points at the rule that answered, and that pointer has to lead somewhere after the rule
 * was taken back. There is no unique index either — "the same rule twice is one rule" holds among
 * the **active** ones, which depends on the clock, so the repository serialises grants instead.
 *
 * See docs/architecture/backend/05-persistence.md and
 * docs/plans/03-rules-and-audit/F0-rules.md.
 */
export const permissionRules = pgTable(
  'permission_rules',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    scope: text('scope').notNull(),
    projectPath: text('project_path'),
    /** The grammar of the Claude Code settings, exactly as written. */
    pattern: text('pattern').notNull(),
    decision: text('decision').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index('permission_rules_user_id_granted_at_idx')
      .on(table.userId, table.grantedAt.desc())
      .where(sql`${table.revokedAt} IS NULL`),
    check('permission_rules_scope_known', sql`${table.scope} IN ('project', 'always')`),
    check('permission_rules_decision_known', sql`${table.decision} IN ('allow', 'deny')`),
    check(
      'permission_rules_project_matches_scope',
      sql`(${table.scope} = 'project') = (${table.projectPath} IS NOT NULL)`,
    ),
    check('permission_rules_expires_after_grant', sql`${table.expiresAt} > ${table.grantedAt}`),
  ],
);
