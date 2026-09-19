import { PermissionNotOwnedError, PermissionRequestNotFoundError } from '@domain/permission';
import type { PermissionRequest } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import type { PermissionRegistry } from './permission-registry';

/** What every caller acting on a request has to say about itself. */
export interface Answerer {
  readonly requestId: string;
  readonly userId: UserId;

  /** Whether the connection is watching a given session. A predicate, because only the registry
   *  knows which session the request belongs to. */
  watchesSession(sessionId: SessionId): boolean;
}

/**
 * The request this caller may act on, or the reason they may not.
 *
 * Written once because answering and extending ask exactly the same two questions, and the second
 * copy is the one that would eventually check only the first. The two refusals are deliberately
 * different, and the difference is the one the status codes are for:
 *
 * - **unknown id** is a record that is not there: `PERMISSION_REQUEST_NOT_FOUND`, 404;
 * - **not this caller's** is an authorisation failure: `PERMISSION_NOT_OWNED`, 403. The credential
 *   is good and the caller is who they say they are; they still may not do this
 *   ([D-17](../../../../docs/plans/01-live-session/decisions.md)).
 *
 * @throws {PermissionRequestNotFoundError} no request with that id in this process
 * @throws {PermissionNotOwnedError} the caller is not watching that session, or is not its owner
 */
export function answerableRequest(
  registry: PermissionRegistry,
  caller: Answerer,
): PermissionRequest {
  const request = registry.find(caller.requestId);

  if (request === null) {
    throw new PermissionRequestNotFoundError(caller.requestId);
  }

  if (!caller.watchesSession(request.sessionId) || !request.userId.equals(caller.userId)) {
    throw new PermissionNotOwnedError(caller.requestId);
  }

  return request;
}
