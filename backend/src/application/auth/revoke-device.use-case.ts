import { DeviceNotFoundError } from '@domain/auth';
import type { Device, UserId } from '@domain/auth';
import type { DeviceContext } from './device-context';
import type { DeviceConnections } from './ports/device-connections.port';

/**
 * Taking a phone out, and making it stick before the next tool call.
 *
 * Three things happen and the order matters. The row is written first, so nothing that arrives
 * after this point can be authorised; then the open sockets of that installation are closed with
 * `4401`, because a socket that stays open goes on answering permission requests until the access
 * token expires — up to fifteen minutes of a revocation that revoked nothing; then it reaches the
 * trail.
 *
 * Closing the sockets happens even when the device was **already** revoked. Revoking twice is a
 * no-op on the row (S-09) and is often somebody clicking again precisely because the phone is
 * still connected.
 *
 * What this cannot do, and what the plan records as
 * [D-18](../../../../docs/plans/02-mobile-approval/decisions.md): reach into the identity provider
 * and revoke the refresh token itself. The backend never holds the app's refresh token — it is a
 * Resource Server, and the app renews directly against the provider. What revocation guarantees is
 * that the credential stops working **here**, on every transport, from this instant.
 */
export class RevokeDeviceUseCase {
  constructor(
    private readonly context: DeviceContext,
    private readonly connections: DeviceConnections,
  ) {}

  /** @throws {DeviceNotFoundError} when no device of this user has that id */
  async execute(userId: UserId, deviceId: string): Promise<Device> {
    const device = await this.context.devices.findById(userId, deviceId);
    if (device === null) {
      throw new DeviceNotFoundError(deviceId);
    }

    const at = this.context.clock.now();
    const revoked = device.revoke(at);
    const already = revoked === device;

    if (!already) {
      await this.context.devices.save(revoked);
    }

    this.connections.closeForDevice(userId, device.installId);

    if (!already) {
      await this.context.trail.execute({
        userId,
        kind: 'device.revoked',
        subjectId: device.id,
        subjectLabel: revoked.snapshot().name,
        at,
      });
    }

    return revoked;
  }
}
