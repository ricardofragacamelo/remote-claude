import type { Device, UserId } from '@domain/auth';
import type { DeviceContext } from './device-context';

/**
 * Which devices of a user a notification can reach.
 *
 * It exists so that `notification` asks `auth` a question rather than reading its table: the
 * boundary between two modules is a use case, not a repository token
 * (docs/architecture/backend/03-modules.md#fronteiras).
 *
 * **Every** approved device, not the most recent one: notifying only the last active phone fails
 * exactly when the phone was left behind
 * ([D-04](../../../../docs/plans/02-mobile-approval/decisions.md#d-04--todos-ou-o-último)).
 */
export class ListApprovedDevicesUseCase {
  constructor(private readonly context: DeviceContext) {}

  async execute(userId: UserId): Promise<readonly Device[]> {
    return this.context.devices.findApprovedByUser(userId);
  }
}

/**
 * Erasing a push token the provider refused.
 *
 * The device **stays approved**. Revoking it would charge a fresh approval through the browser
 * every time the operating system rotates a token, and the phone would drop out of the flow for
 * a reason nobody caused
 * ([D-13](../../../../docs/plans/02-mobile-approval/decisions.md#d-13--o-token-que-morre-calado)).
 *
 * A device that has gone in the meantime is simply not there any more, and that is not a failure:
 * there is no token left to erase.
 */
export class ForgetPushTokenUseCase {
  constructor(private readonly context: DeviceContext) {}

  /** @returns whether there was a device to change */
  async execute(userId: UserId, deviceId: string): Promise<boolean> {
    const device = await this.context.devices.findById(userId, deviceId);

    if (device === null) {
      return false;
    }

    await this.context.devices.save(device.forgetPushToken());
    return true;
  }
}
