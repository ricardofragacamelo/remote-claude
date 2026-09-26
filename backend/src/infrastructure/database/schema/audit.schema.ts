import { boolean, check, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { invocationColumns, keysetIndexes, trailColumns } from './columns';

/**
 * The `audit_entries` table.
 *
 * It breaks two of the schema conventions, and both on purpose.
 *
 * **It has a `seq` beside its `id`.** The identifier stays the primary key; the sequence exists
 * because
 * the paginated query needs an ordering that is total and monotonic, and `at` is neither — two
 * entries land in the same millisecond, and the clock of the machine can be set back. `at`
 * filters, `seq` orders, and the indexes follow the ordering rather than the timestamp.
 *
 * The identifier is a ULID in a `text` column rather than a `uuid` with a database default, for
 * the same reason the other tables here do it: the id is minted by the domain's `IdGenerator`, so
 * a default on this side would mean the database decides who the entry is.
 *
 * **It is protected by a trigger, not by a convention.** See the migration: `UPDATE` always
 * aborts, `DELETE` aborts inside the ninety-day floor. That makes append-only a property of the
 * database instead of a promise of the code — the one that survives a bug of ours, a distracted
 * migration or a `DELETE` typed by hand.
 *
 * See docs/architecture/backend/05-persistence.md#a-trilha-de-auditoria.
 */
export const auditEntries = pgTable(
  'audit_entries',
  {
    id: text('id').primaryKey(),
    ...invocationColumns,
    decision: text('decision').notNull(),
    deviceId: text('device_id'),
    ip: text('ip'),
    /**
     * The trace in scope when the entry was written — the turn's, or the answer's. Stamped by the
     * repository from the context, never by the domain, which does not know observability exists.
     */
    traceId: text('trace_id'),
    // The verdict of a decision entry, null on every `recorded` one. Written with the entry rather
    // than joined from `permission_requests` at read time: the question "who authorised this?" is
    // answered by this table alone (D-15).
    requestId: text('request_id'),
    auto: boolean('auto'),
    ruleId: text('rule_id'),
    scope: text('scope'),
    resolvedBy: text('resolved_by'),
    resolvedFrom: text('resolved_from'),
    ...trailColumns,
  },
  (table) => [
    // Keyset pagination is descending over `seq`, scoped by user or by session.
    ...keysetIndexes('audit_entries', table, { name: 'session_id', column: table.sessionId }),
    // The retention purge takes the oldest rows before its cutoff, one batch at a time.
    index('audit_entries_at_idx').on(table.at),
    // One record per invocation **per fact**. A redelivered tool call writes `recorded` again and
    // collides with the entry it repeats, so the trail never claims a command ran twice; a
    // permission decision about the same invocation is a different fact and gets its own row.
    // `NULLS DISTINCT` is the default and it is the point: `tool_use_id` is nullable because the
    // SDK does not always give one, and under that rule two rows without an id do not collide.
    uniqueIndex('audit_entries_session_id_tool_use_id_decision_key').on(
      table.sessionId,
      table.toolUseId,
      table.decision,
    ),
    check(
      'audit_entries_decision_known',
      sql`${table.decision} IN ('recorded', 'allowed', 'denied')`,
    ),
    // The hook fires before anybody has voted, so its entry carries no verdict.
    check(
      'audit_entries_recorded_has_no_verdict',
      sql`${table.decision} <> 'recorded' OR (${table.requestId} IS NULL AND ${table.auto} IS NULL AND ${table.ruleId} IS NULL AND ${table.scope} IS NULL AND ${table.resolvedBy} IS NULL AND ${table.resolvedFrom} IS NULL)`,
    ),
    // A rule is what answers when nobody does.
    check('audit_entries_rule_is_automatic', sql`${table.ruleId} IS NULL OR ${table.auto} IS TRUE`),
  ],
);
