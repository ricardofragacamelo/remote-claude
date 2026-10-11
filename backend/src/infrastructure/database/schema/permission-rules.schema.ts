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
    /**
     * The canonical grammar, exactly as written — `shell(git status:*)`. On a rule still `native`,
     * or switched off, the engine's own grammar it was written in (plan 28, B-33).
     */
    pattern: text('pattern').notNull(),
    /** The engine the rule is restricted to; `NULL` for every engine whose calls have the kind. */
    engine: text('engine'),
    /**
     * `native` for a rule still in an engine's grammar, `canonical` once the migration read it — no
     * default: the repository says, always `canonical`.
     */
    grammar: text('grammar').notNull(),
    /** Why the rule was switched off, `NULL` for one that was not. A disabled rule never answers. */
    disabledReason: text('disabled_reason'),
    /** The engine's pattern a migrated rule was written as. */
    nativePattern: text('native_pattern'),
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
    check('permission_rules_grammar_known', sql`${table.grammar} IN ('native', 'canonical')`),
    check(
      'permission_rules_disabled_is_canonical',
      sql`${table.disabledReason} IS NULL OR ${table.grammar} = 'canonical'`,
    ),
    check(
      'permission_rules_engine_form',
      sql`${table.engine} IS NULL OR ${table.engine} ~ '^[a-z][a-z0-9-]{0,31}$'`,
    ),
  ],
);
