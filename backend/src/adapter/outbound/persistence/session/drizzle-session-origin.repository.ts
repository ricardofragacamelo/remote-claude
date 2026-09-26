import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import type { SessionOrigin, SessionOriginRepository } from '@application/session';
import { UserId } from '@domain/auth';
import type { ClaudeSessionId } from '@domain/transcript';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { sessionOrigins } from '@infra/database/schema';
import { runLogged } from '../query-logging';

/**
 * `session_origins`, in PostgreSQL.
 *
 * Two operations and no business rule: write the provenance once, and say which of a set of
 * conversations it covers. What "ours" means for a caller is decided in `domain/transcript`.
 */
@Injectable()
export class DrizzleSessionOriginRepository implements SessionOriginRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async record(origin: SessionOrigin): Promise<void> {
    // The first record stands. The id is minted by us, so a conflict is a retry of the same
    // opening, and rewriting the owner of a conversation is not something a retry should do.
    await runLogged(
      this.context.logger,
      'sessionOrigin.record',
      this.context.db
        .insert(sessionOrigins)
        .values({
          claudeSessionId: origin.claudeSessionId.value,
          sessionId: origin.sessionId.value,
          userId: origin.openedBy.value,
          workspacePath: origin.workspace.value,
          openedAt: origin.openedAt,
        })
        .onConflictDoNothing({ target: sessionOrigins.claudeSessionId }),
    );
  }

  async openersOf(ids: readonly ClaudeSessionId[]): Promise<ReadonlyMap<string, UserId>> {
    // An empty `IN ()` is not SQL, and asking the database about nothing is a round trip for
    // nothing: a workspace with no conversation is the common case of a fresh installation.
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await runLogged(
      this.context.logger,
      'sessionOrigin.openersOf',
      this.context.db
        .select({ claudeSessionId: sessionOrigins.claudeSessionId, userId: sessionOrigins.userId })
        .from(sessionOrigins)
        .where(
          inArray(
            sessionOrigins.claudeSessionId,
            ids.map((id) => id.value),
          ),
        ),
    );

    return new Map(rows.map((row) => [row.claudeSessionId, UserId.create(row.userId)]));
  }
}
