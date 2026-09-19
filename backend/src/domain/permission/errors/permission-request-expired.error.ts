import { DomainError } from '@domain/shared';

/**
 * The deadline passed with nobody answering, so the request was denied.
 *
 * It is the outcome of silence, and silence never authorises. Ours is the only timeout there is:
 * the CLI held a permission open for 150 s without giving up or reporting anything
 * (docs/discovery/01-descoberta-claude-agent-sdk.md#84).
 */
export class PermissionRequestExpiredError extends DomainError {
  readonly code = 'PERMISSION_REQUEST_EXPIRED';
  readonly messageKey = 'permission.error.requestExpired';

  constructor(requestId: string) {
    super(`permission request ${requestId} expired`, { requestId });
  }
}
