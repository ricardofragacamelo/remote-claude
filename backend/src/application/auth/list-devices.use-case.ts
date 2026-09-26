import type { Device, UserId } from '@domain/auth';
import type { DeviceRepository } from './ports/device.repository';

/**
 * The devices of one user, for the screen that approves them.
 *
 * Only theirs. A device of somebody else is not listed at all, rather than listed and refused:
 * the list is where a person recognises their own phone, and a row they cannot act on is noise
 * that makes recognising the right one harder.
 */
export class ListDevicesUseCase {
  constructor(private readonly devices: DeviceRepository) {}

  async execute(userId: UserId): Promise<readonly Device[]> {
    return this.devices.findByUser(userId);
  }
}
