import { DomainError } from '@domain/shared';

/**
 * The caller may not act on this request.
 *
 * An **authorisation** failure, and therefore `403`: the credential is good, the caller is who
 * they say they are, and they still may not do this. `404` is for a record that is not there —
 * a different question, with a different answer
 * ([D-17](../../../../../docs/plans/01-live-session/decisions.md)).
 */
export class PermissionNotOwnedError extends DomainError {
  readonly code = 'PERMISSION_NOT_OWNED';
  readonly messageKey = 'permission.error.notOwned';

  constructor(requestId: string) {
    super(`permission request ${requestId} belongs to a session this caller is not watching`, {
      requestId,
    });
  }
}
