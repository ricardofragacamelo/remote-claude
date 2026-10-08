import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { QuestionRecord, QuestionRecordSource } from '@application/permission';
import type { UserId } from '@domain/auth';
import { PERSISTENCE_CONTEXT, type PersistenceContext } from '@infra/database/persistence-context';
import { permissionRequests } from '@infra/database/schema';
import { runLogged } from '../query-logging';

/**
 * The questions recorded in `permission_requests`, by tool call — what the history of a session
 * joins to the line of an `AskUserQuestion` (plan 24, B-21).
 *
 * Only the person's own requests: the history of a conversation is read by its owner, and a record
 * of somebody else's answer is not theirs to see. Oldest first, so the latest of a call asked about
 * twice is the one kept.
 */
@Injectable()
export class DrizzleQuestionRecordSource implements QuestionRecordSource {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async recordsOf(
    userId: UserId,
    toolUseIds: readonly string[],
  ): Promise<ReadonlyMap<string, QuestionRecord>> {
    const rows = await runLogged(
      this.context.logger,
      'permission.questions',
      this.context.db
        .select({
          toolUseId: permissionRequests.toolUseId,
          status: permissionRequests.status,
          decision: permissionRequests.decision,
          reason: permissionRequests.reason,
          answers: permissionRequests.answers,
        })
        .from(permissionRequests)
        .where(
          and(
            eq(permissionRequests.userId, userId.value),
            inArray(permissionRequests.toolUseId, [...toolUseIds]),
          ),
        )
        .orderBy(asc(permissionRequests.requestedAt)),
    );

    return new Map(
      rows.map((row) => [
        String(row.toolUseId),
        {
          status: row.status as QuestionRecord['status'],
          decision: row.decision as QuestionRecord['decision'],
          reason: row.reason,
          answers: row.answers,
        },
      ]),
    );
  }
}
