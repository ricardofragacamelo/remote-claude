import { Inject, Injectable } from '@nestjs/common';

import type { AuditRepository } from '@application/audit';
import type { AuditEntry } from '@domain/audit';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { auditEntries } from '@infra/database/schema';
import { currentTraceId } from '@shared/logging/trace-context';
import { runLogged } from '../query-logging';
import { toRow } from './audit-entry.mapper';

/**
 * `audit_entries`, in PostgreSQL.
 *
 * One method, and that is the whole surface: the trail is written and never edited. A repository
 * that offered an update would be offering an operation the table's trigger refuses.
 *
 * The insert ignores a conflict on `(session_id, tool_use_id, decision)` and only on that triple.
 * The SDK redelivers a pending tool call after a transport gap, and a second `recorded` row for
 * the same invocation would make the trail claim the command ran twice. The `decision` is part of
 * the key because one invocation produces two different facts — the hook saw it, and a human
 * allowed or refused it — and a key without it would silently drop the second.
 *
 * It does **not** ignore a conflict on the primary key: that would mean two different invocations
 * were given one id, which is a bug of ours and has to surface as a failed write — refusing the
 * tool — rather than be absorbed as an upsert that replaces one record of what was executed with
 * another.
 *
 * The `trace_id` is stamped **here**, from the context, and nowhere closer to the domain: it is what
 * leads from the record to the log lines and the events of the same turn, and observability is not
 * something the domain is allowed to know about ([D-16](../../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
@Injectable()
export class DrizzleAuditRepository implements AuditRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async append(entry: AuditEntry): Promise<void> {
    await runLogged(
      this.context.logger,
      'audit.append',
      this.context.db
        .insert(auditEntries)
        .values(toRow(entry, currentTraceId()))
        .onConflictDoNothing({
          target: [auditEntries.sessionId, auditEntries.toolUseId, auditEntries.decision],
        }),
    );
  }
}
