import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';

/**
 * Whether a user owns a session — whatever kind of session it is.
 *
 * `session.attach` asks one question, and it is a transport question: may this connection receive
 * this stream? Two very different things answer it. A live session of Claude is a subprocess held
 * in memory; a diagnostic session is a row and a counter. Neither knows about the other, and a use
 * case that reached into both would be the coupling this port exists to avoid.
 *
 * The gateway composes the sources, and a session is attachable when **any** of them owns it.
 * There is no ambiguity to resolve: the ids are minted by one generator and never collide — so a
 * source that has never heard of an id says `unknown`, and only the one that holds it decides.
 */
/**
 * What a source found when asked about a session.
 *
 * Three values and not a boolean, because the two refusals are different answers: a session that
 * is **not there** is `404`, and one that is there and is somebody else's is `403`. A boolean
 * cannot say which, and a caller that cannot say which has to pick one for both
 * ([D-17](../../../../docs/plans/01-live-session/decisions.md)).
 */
export type SessionAccess = 'owned' | 'notOwned' | 'unknown';

export interface SessionOwnership {
  access(sessionId: SessionId, userId: UserId): Promise<SessionAccess>;
}

/**
 * There is no DI token here on purpose.
 *
 * Nest resolves a token to exactly one provider, so two modules answering the same token would
 * mean one of them silently replacing the other — and the one that lost would be whichever module
 * happened to be imported second. The implementations are provided and injected by class, and the
 * gateway is where the list is composed.
 */
