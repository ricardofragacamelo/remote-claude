import type { Device } from '@domain/auth';
import { PushMessage } from '@domain/notification';
import type { PushDelivery, PushSender } from './ports/push.port';
import type { PushTokenRegistry } from './ports/push-token-registry.port';

/** What telling the phone came to: its delivery, or that there was no token to send to. */
export type DeviceApprovedOutcome = PushDelivery | 'noToken';

/**
 * Tells a phone it was approved, and may decide from now on (plan 17, F3).
 *
 * **One attempt** (D-15): this is a courtesy — the phone also checks again when it comes back to
 * the foreground (D-16) — and a notice that lands minutes later, after retries, only confuses. A
 * token the provider says is gone is forgotten, as it is for a permission push; the device stays
 * approved.
 */
export class NotifyDeviceApprovedUseCase {
  constructor(
    private readonly sender: PushSender,
    private readonly tokens: PushTokenRegistry,
  ) {}

  async execute(device: Device): Promise<DeviceApprovedOutcome> {
    const token = device.pushToken;

    if (token === null) {
      return 'noToken';
    }

    const outcome = await this.sender.send(
      PushMessage.deviceApproved({ deviceId: device.id, token, locale: device.locale }),
    );

    if (outcome.delivery === 'tokenRejected') {
      await this.tokens.forget(device);
    }

    return outcome.delivery;
  }
}
