import { boolean, check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { auditColumns, invocationColumns } from './columns';

/**
 * The `permission_requests` table: what was asked of a human, and how it ended.
 *
 * It is a **history** and not a trail, which is why it has no trigger refusing `UPDATE`. A row is
 * written twice — once when the question is put to somebody, once when it is settled — and the
 * second write is the same fact reaching its conclusion rather than a record being rewritten. The
 * append-only record of what was *executed* is `audit_entries`, and nothing here touches it.
 *
 * The id is the SDK's `requestId`: the idempotency key of the whole flow. Never `tool_use_id`,
 * which the SDK does not always give and which repeats across a redelivery.
 *
 * See docs/architecture/backend/05-persistence.md and
 * docs/plans/01-live-session/F4-permission.md.
 */
export const permissionRequests = pgTable(
  'permission_requests',
  {
    id: text('id').primaryKey(),
    // The same five columns as the trail: they name the same event, and writing them out twice is
    // five chances for the two records of one invocation to stop lining up.
    ...invocationColumns,
    riskHint: text('risk_hint').notNull(),
    status: text('status').notNull(),
    decision: text('decision'),
    reason: text('reason'),
    scope: text('scope'),
    resolvedBy: text('resolved_by'),
    resolvedFrom: text('resolved_from'),
    auto: boolean('auto'),
    /** The rule that answered, when one did. No foreign key: a `session` rule is never stored. */
    ruleId: text('rule_id'),
    extensionsUsed: integer('extensions_used').notNull().default(0),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index('permission_requests_session_id_requested_at_idx').on(
      table.sessionId,
      table.requestedAt.desc(),
    ),
    index('permission_requests_user_id_requested_at_idx').on(
      table.userId,
      table.requestedAt.desc(),
    ),
    check(
      'permission_requests_status_known',
      sql`${table.status} IN ('pending', 'resolved', 'expired')`,
    ),
    check(
      'permission_requests_decision_known',
      sql`${table.decision} IS NULL OR ${table.decision} IN ('allow', 'deny')`,
    ),
    check(
      'permission_requests_risk_hint_known',
      sql`${table.riskHint} IN ('read', 'write', 'destructive')`,
    ),
    // Silence never authorises, and the database says so too: a decision nobody made can only be
    // a refusal. A constraint rather than a comment, because this is the one invariant of the
    // product that has to survive a bug of ours.
    check(
      'permission_requests_auto_allow_needs_author',
      sql`${table.auto} IS NOT TRUE OR ${table.decision} IS DISTINCT FROM 'allow' OR ${table.resolvedBy} IS NOT NULL`,
    ),
  ],
);
