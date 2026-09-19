import { DomainError } from '@domain/shared';

/**
 * The session exists, the caller is who they say they are, and it is not theirs.
 *
 * `403`, because that is what `403` means. The earlier design answered `404` here to avoid
 * confirming that an id somebody is probing for is real; that was a semantics of its own, and a
 * product that invents one ends up with two answers for the same question and clients that cannot
 * tell "renew your credential" from "stop asking"
 * ([D-17](../../../../../docs/plans/01-live-session/decisions.md)).
 *
 * The one that stays `404` is the honest one: a session that is **not there**.
 */
export class SessionForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly messageKey = 'session.error.forbidden';

  constructor(sessionId: string) {
    super(`session ${sessionId} belongs to somebody else`, { sessionId });
  }
}
