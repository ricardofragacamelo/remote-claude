import {
  DeviceApprovalForbiddenError,
  DeviceNotFoundError,
  PENDING_DEVICE_TTL_MS,
} from '@domain/auth';
import type { Device, UserId } from '@domain/auth';
import type { DeviceContext } from './device-context';

/** Who is asking, and from where. */
export interface ApproveDeviceCommand {
  readonly userId: UserId;
  readonly deviceId: string;

  /**
   * The installation the caller is using, when the caller is a device.
   *
   * `null` is the browser, which is the only thing allowed to approve. It arrives as an argument
   * rather than being looked up because it is a fact about the **request**, not about a row.
   */
  readonly callerInstallId: string | null;
}

/**
 * Somebody letting a phone decide, from a session that is already trusted.
 *
 * Approval comes from the browser and from nowhere else. If an approved device could approve the
 * next one, one compromised phone would approve its successor and the registration would stop
 * proving anything — so the refusal is on **any** caller that is a device, not only on the one
 * approving itself ([D-02](../../../../docs/plans/02-mobile-approval/decisions.md), S-06).
 *
 * Approving twice changes nothing (two tabs, one slow page). Approving a revoked device is
 * refused by the entity: bringing a phone back is registering it again, deliberately.
 */
export class ApproveDeviceUseCase {
  constructor(
    private readonly context: DeviceContext,
    private readonly ttlMs: number = PENDING_DEVICE_TTL_MS,
  ) {}

  /**
   * @throws {DeviceApprovalForbiddenError} when the caller is itself a device
   * @throws {DeviceNotFoundError} when no device of this user has that id, or the pending
   *   registration has sat past the deadline
   * @throws {import('@domain/auth').DeviceRevokedError} when the device has been revoked
   */
  async execute(command: ApproveDeviceCommand): Promise<Device> {
    if (command.callerInstallId !== null) {
      throw new DeviceApprovalForbiddenError(command.callerInstallId);
    }

    const at = this.context.clock.now();
    const device = await this.context.devices.findById(command.userId, command.deviceId);

    // A registration past the deadline is gone whether or not the sweep has run yet. Letting the
    // timing of a background job decide whether a forgotten device can still be approved would
    // make the rule a race — and on the wrong side of it, the click authorises a phone that the
    // list was supposed to have stopped showing days ago (S-60).
    if (device === null || device.hasPendingExpired(at, this.ttlMs)) {
      throw new DeviceNotFoundError(command.deviceId);
    }

    const approved = device.approve(at);

    // Already approved is the same object, so nothing is written and nothing is audited: a second
    // click is not a second approval, and a trail that says it was makes the first one harder to
    // find.
    if (approved === device) {
      return device;
    }

    await this.context.devices.save(approved);
    await this.context.trail.execute({
      userId: command.userId,
      kind: 'device.approved',
      subjectId: device.id,
      subjectLabel: approved.snapshot().name,
      at,
    });

    return approved;
  }
}
