import { SessionId, SessionNotFoundError } from '@domain/session';
import type { UserId } from '@domain/auth';
import type { SessionRepository } from './ports/session.repository';

/**
 * Authorises a connection to observe a session.
 *
 * The replay itself belongs to the transport — the buffer is a transport concern and volatile by
 * design — so this use case answers only the question the domain owns: may this user watch this
 * session?
 */
export class AttachSessionUseCase {
  constructor(private readonly sessions: SessionRepository) {}

  /**
   * @throws {import('../../domain/session').InvalidSessionIdError} when `sessionId` is not a ULID
   * @throws {SessionNotFoundError} when it is unknown, or owned by someone else
   */
  async execute(rawSessionId: string, userId: UserId): Promise<SessionId> {
    const sessionId = SessionId.create(rawSessionId);
    const found = await this.sessions.findById(sessionId);

    if (found === null || !found.isOwnedBy(userId)) {
      throw new SessionNotFoundError(sessionId.value);
    }

    return sessionId;
  }
}
