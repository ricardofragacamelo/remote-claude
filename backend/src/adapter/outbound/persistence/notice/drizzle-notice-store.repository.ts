import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import type { NoticeStore } from '@application/notice';
import { ID_GENERATOR } from '@application/shared';
import type { ConversationRef } from '@domain/engine';
import type { IdGenerator } from '@domain/shared';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { persistedNotices } from '@infra/database/schema';
import type { SessionNoticePayload } from '@remote-claude/contracts';
import { runLogged } from '../query-logging';
import { toPayload } from './persisted-notice.mapper';

/**
 * `persisted_notices`, in PostgreSQL (Plan 27, F7, D-15).
 *
 * A record is `INSERT … ON CONFLICT DO NOTHING` on the unique `(engine, conversationId, noticeId)`
 * key: the same notice recorded twice, in sequence or at once from two writers, leaves the one row
 * the first writer put there (S-110, S-111) — no advisory lock needed, the database's own
 * constraint is what makes concurrent writers converge on one winner.
 */
@Injectable()
export class DrizzleNoticeStoreRepository implements NoticeStore {
  constructor(
    @Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async record(conversation: ConversationRef, payload: SessionNoticePayload): Promise<void> {
    try {
      await runLogged(
        this.context.logger,
        'persistedNotice.record',
        this.context.db
          .insert(persistedNotices)
          .values({
            id: this.ids.next(),
            engine: conversation.engine.value,
            conversationId: conversation.id,
            noticeId: payload.noticeId,
            payload: payload as unknown as Record<string, unknown>,
            recordedAt: this.context.clock.now(),
          })
          .onConflictDoNothing({
            target: [
              persistedNotices.engine,
              persistedNotices.conversationId,
              persistedNotices.noticeId,
            ],
          }),
      );
    } catch (error) {
      // Never rejects (the port's own contract, S-116): the event already reached the client live,
      // and a database hiccup writing a side copy of it must not be why a live session goes down.
      this.context.logger.error(
        {
          op: 'persistedNotice.record',
          layer: 'adapter',
          engine: conversation.engine.value,
          conversationId: conversation.id,
          noticeId: payload.noticeId,
          err: error,
        },
        'failed to persist a session.notice outside the transcript',
      );
    }
  }

  async listFor(conversation: ConversationRef): Promise<readonly SessionNoticePayload[]> {
    const rows = await runLogged(
      this.context.logger,
      'persistedNotice.listFor',
      this.context.db
        .select({ payload: persistedNotices.payload, recordedAt: persistedNotices.recordedAt })
        .from(persistedNotices)
        .where(
          and(
            eq(persistedNotices.engine, conversation.engine.value),
            eq(persistedNotices.conversationId, conversation.id),
          ),
        )
        .orderBy(asc(persistedNotices.seq)),
    );

    return rows.map(toPayload);
  }
}
