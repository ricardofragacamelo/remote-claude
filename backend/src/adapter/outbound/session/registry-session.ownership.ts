import { Inject, Injectable } from '@nestjs/common';

import { SessionRegistry } from '@application/session';
import type { SessionAccess, SessionOwnership } from '@application/session';
import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';

/** A live session of Claude is owned by whoever opened it, and only while it is running. */
@Injectable()
export class RegistrySessionOwnership implements SessionOwnership {
  constructor(@Inject(SessionRegistry) private readonly registry: SessionRegistry) {}

  access(sessionId: SessionId, userId: UserId): Promise<SessionAccess> {
    const live = this.registry.find(sessionId);

    if (live === null) {
      // Not "somebody else's": a session that has ended is gone from the registry, and this
      // source has nothing to say about an id it does not hold.
      return Promise.resolve('unknown');
    }

    return Promise.resolve(live.session.isOwnedBy(userId) ? 'owned' : 'notOwned');
  }
}
