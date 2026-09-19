import { DomainError } from '@domain/shared';

/**
 * No pending request answers to that id — it never existed, or it has already been settled.
 *
 * The two are deliberately one answer. A settled request is gone from the registry by the time
 * anybody can ask about it, and distinguishing "never was" from "was, and is over" would say
 * something about ids the caller did not already know.
 */
export class PermissionRequestNotFoundError extends DomainError {
  readonly code = 'PERMISSION_REQUEST_NOT_FOUND';
  readonly messageKey = 'permission.error.requestNotFound';

  constructor(requestId: string) {
    super(`permission request ${requestId} is not pending`, { requestId });
  }
}
