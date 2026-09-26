import { DomainError } from '@domain/shared';

/**
 * The credential is good, the device is not approved.
 *
 * `403` and never `401`: renewing the token changes nothing, and a client that treated the two
 * the same would sit in a renewal loop
 * (docs/architecture/shared/08-authentication.md#erros).
 */
export class DeviceNotRegisteredError extends DomainError {
  readonly code = 'DEVICE_NOT_REGISTERED';
  readonly messageKey = 'auth.error.deviceNotRegistered';

  constructor(readonly installId: string) {
    super(`device ${installId} is not approved`);
  }
}
