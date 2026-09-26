import { DeviceNotRegisteredError } from '@domain/auth';
import type { Device, UserId } from '@domain/auth';
import type { DeviceRepository } from './ports/device.repository';

/**
 * Turns the installation a connection declared into the device it is, and says whether it decides.
 *
 * The asymmetry is the whole point of the phase: **watching a session is allowed to a pending
 * device, answering a permission request is not** (S-03, S-04, S-05). A phone that cannot yet
 * decide can still show what is happening, and hiding the stream from it would turn "wait to be
 * approved" into "the app is broken".
 *
 * A caller with no installation is the browser. It is not a device, it never becomes one, and it
 * decides — which is exactly the asymmetry that makes approval from the browser mean something.
 */
export class ResolveDeviceUseCase {
  constructor(private readonly devices: DeviceRepository) {}

  /**
   * The device behind a connection, or `null` for the browser.
   *
   * @throws {DeviceNotRegisteredError} when the installation has no row at all — a client naming
   *   an id nobody registered is not a pending device, it is an unknown one
   */
  async execute(userId: UserId, installId: string | null): Promise<Device | null> {
    if (installId === null) {
      return null;
    }

    const device = await this.devices.findByInstallId(userId, installId);
    if (device === null) {
      throw new DeviceNotRegisteredError(installId);
    }

    return device;
  }

  /**
   * The device behind a connection, refusing unless it may decide.
   *
   * @throws {DeviceNotRegisteredError} unknown or still pending
   * @throws {import('@domain/auth').DeviceRevokedError} revoked
   */
  async ensureCanDecide(userId: UserId, installId: string | null): Promise<Device | null> {
    const device = await this.execute(userId, installId);

    device?.ensureCanDecide();

    return device;
  }
}
