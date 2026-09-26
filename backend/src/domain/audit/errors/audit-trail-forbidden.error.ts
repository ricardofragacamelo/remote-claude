import { DomainError } from '@domain/shared';

/**
 * The trail asked for is somebody else's: a session whose entries belong to another person.
 *
 * `403`, because that is what `403` means — the caller is who they say they are, and this is not
 * theirs ([D-05](../../../../../docs/plans/03-rules-and-audit/decisions.md)). The query itself is
 * always scoped by who asks, so nobody ever receives another person's row; this is the answer to a
 * request that **points** at one ([D-17](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export class AuditTrailForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly messageKey = 'audit.error.forbidden';

  constructor(sessionId: string) {
    super(`the trail of session ${sessionId} belongs to somebody else`, { sessionId });
  }
}
