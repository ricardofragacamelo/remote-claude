import { SessionForbiddenError, SessionId, SessionNotFoundError } from '@domain/session';
import type { UserId } from '@domain/auth';
import type { SessionConversation } from './ports/claude-session.port';
import type { SessionOwnership } from './ports/session-ownership.port';

/** Which conversation of Claude a stream is, when it is one. */
export interface SessionConversations {
  /** The conversation of a live session, or `null` for a stream that is not one. */
  conversationOf(sessionId: SessionId): SessionConversation | null;
}

/** A stream a connection may now watch, and the conversation it is — when it is one. */
export interface AttachedSession {
  readonly sessionId: SessionId;

  /**
   * Where the history of this stream is read from. It travels on the ack because a `gap` is
   * exactly when the buffer no longer holds the `session.started` that named it (B-07).
   */
  readonly conversation: SessionConversation | null;
}

/**
 * Authorises a connection to observe a session.
 *
 * The replay itself belongs to the transport — the ring buffer is a transport concern and volatile
 * by design — so this use case answers only the question the domain owns: may this user watch this
 * session?
 *
 * It asks every source it was given rather than one: a live session of Claude and the diagnostic
 * round trip are different things that both produce a stream, and both are attachable by whoever
 * owns them.
 */
export class AttachSessionUseCase {
  constructor(
    private readonly owners: readonly SessionOwnership[],
    private readonly conversations: SessionConversations,
  ) {}

  /**
   * **Two refusals, because they are two different facts.** A session no source has heard of is
   * `404`; one a source holds for somebody else is `403`. Collapsing them into `404` — which this
   * used to do, so that a refusal would not confirm an id somebody is probing for — is a
   * semantics of its own, and it leaves a client unable to tell "it is gone" from "it is not
   * yours" ([D-17](../../../../docs/plans/01-live-session/decisions.md)).
   *
   * @throws {import('@domain/session').InvalidSessionIdError} when `sessionId` is not a ULID
   * @throws {SessionNotFoundError} when no source has that id
   * @throws {SessionForbiddenError} when a source has it, and it is somebody else's
   */
  async execute(rawSessionId: string, userId: UserId): Promise<AttachedSession> {
    const sessionId = SessionId.create(rawSessionId);
    let known = false;

    for (const owner of this.owners) {
      const access = await owner.access(sessionId, userId);

      if (access === 'owned') {
        return { sessionId, conversation: this.conversations.conversationOf(sessionId) };
      }

      known ||= access === 'notOwned';
    }

    if (known) {
      throw new SessionForbiddenError(sessionId.value);
    }

    throw new SessionNotFoundError(sessionId.value);
  }
}
