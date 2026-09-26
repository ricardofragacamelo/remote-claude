import { DomainError } from '@domain/shared';

/**
 * The device was approved once and is not any more.
 *
 * Distinct from {@link import('./device-not-registered.error').DeviceNotRegisteredError} on
 * purpose: "wait to be approved" and "this phone has been taken out" are different things to say
 * to whoever is holding it, and only one of them ends by somebody clicking approve.
 */
export class DeviceRevokedError extends DomainError {
  readonly code = 'DEVICE_REVOKED';
  readonly messageKey = 'auth.error.deviceRevoked';

  constructor(readonly installId: string) {
    super(`device ${installId} is revoked`);
  }
}
