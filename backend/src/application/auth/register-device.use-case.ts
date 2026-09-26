import { Device } from '@domain/auth';
import type { IdGenerator } from '@domain/shared';
import type { RegisterDeviceCommand } from './commands/register-device.command';
import type { DeviceContext } from './device-context';

/**
 * The app saying which installation it is.
 *
 * Registering the same installation again **updates** the row and never adds one, and never
 * changes the status: the app calls this on every login and on every push-token rotation (D-13),
 * so a second call has to be the cheapest thing in the flow. A revoked device that registers again
 * stays revoked — otherwise reopening the app would undo a revocation (S-02).
 *
 * Only the **first** registration reaches the trail. Auditing every reopening of the app would
 * bury the three facts somebody investigating actually needs — approved, revoked, by whom — under
 * a row per launch.
 */
export class RegisterDeviceUseCase {
  constructor(
    private readonly context: DeviceContext,
    private readonly ids: IdGenerator,
  ) {}

  /** @returns the device as it now stands — pending on the first call, unchanged after that */
  async execute(command: RegisterDeviceCommand): Promise<Device> {
    const at = this.context.clock.now();
    const known = await this.context.devices.findByInstallId(command.userId, command.installId);

    if (known !== null) {
      const refreshed = known.refresh({
        name: command.name,
        platform: command.platform,
        appVersion: command.appVersion,
        pushToken: command.pushToken,
        locale: command.locale,
        at,
      });

      await this.context.devices.save(refreshed);
      return refreshed;
    }

    const device = Device.register({ ...command, id: this.ids.next(), at });

    await this.context.devices.save(device);
    await this.context.trail.execute({
      userId: command.userId,
      kind: 'device.registered',
      subjectId: device.id,
      subjectLabel: command.name,
      at,
    });

    return device;
  }
}
