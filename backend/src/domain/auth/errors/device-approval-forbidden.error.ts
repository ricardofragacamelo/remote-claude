import { DomainError } from '@domain/shared';

/**
 * A device tried to approve a device.
 *
 * Approval starts from a session that is already trusted — the browser — and never from a phone.
 * If an approved device could approve the next one, one compromised phone would approve its
 * successor, and the registration would stop proving anything
 * ([D-02](../../../../docs/plans/02-mobile-approval/decisions.md)).
 */
export class DeviceApprovalForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly messageKey = 'auth.error.deviceApprovalForbidden';

  constructor(readonly installId: string) {
    super(`device ${installId} may not approve a device`);
  }
}
