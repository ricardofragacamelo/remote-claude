import { Inject, Injectable } from '@nestjs/common';

import { DIAG_SESSION_REPOSITORY } from '@application/diag';
import type { DiagSessionRepository } from '@application/diag';
import type { SessionAccess, SessionOwnership } from '@application/session';
import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';

/**
 * A diagnostic session is owned by whoever opened it, and it outlives the process.
 *
 * It is attachable for the same reason it exists: the round trip is the cheapest way to exercise
 * fan-out, `seq` and replay end to end, and none of those needs a Claude subprocess.
 */
@Injectable()
export class DiagSessionOwnership implements SessionOwnership {
  constructor(@Inject(DIAG_SESSION_REPOSITORY) private readonly sessions: DiagSessionRepository) {}

  async access(sessionId: SessionId, userId: UserId): Promise<SessionAccess> {
    const session = await this.sessions.findById(sessionId);

    if (session === null) {
      return 'unknown';
    }

    return session.isOwnedBy(userId) ? 'owned' : 'notOwned';
  }
}
