import { DomainError } from '@domain/shared';

/**
 * No device of this user with that id.
 *
 * A device of **somebody else** answers this too, and that is deliberate: telling a caller that an
 * id exists and is not theirs is telling them an id exists.
 */
export class DeviceNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly messageKey = 'auth.error.deviceNotFound';

  constructor(readonly deviceId: string) {
    super(`no device ${deviceId} for this user`);
  }
}
