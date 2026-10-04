import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { DeviceApprovedEvent, DeviceEvents } from '@application/auth';
import { LOGGER, type Logger } from '@shared/logging/logger';

export const DEVICE_APPROVED = 'device.approved';

/**
 * The device facts, on the internal bus.
 *
 * **It never fails the approval.** What a consumer throws is logged and goes no further: the phone
 * is approved whether or not it could be told so — it finds out on its own the next time it comes
 * back to the foreground (plan 17, D-16).
 */
@Injectable()
export class EmitterDeviceEvents implements DeviceEvents {
  constructor(
    @Inject(EventEmitter2) private readonly emitter: EventEmitter2,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  approved(event: DeviceApprovedEvent): void {
    const line = { op: 'device.approve', layer: 'adapter', deviceId: event.device.id };
    this.logger.debug(line, 'publishing device.approved on the internal bus');

    try {
      this.emitter.emit(DEVICE_APPROVED, event);
    } catch (error) {
      this.logger.error({ ...line, err: error }, `a consumer of ${DEVICE_APPROVED} failed`);
    }
  }
}
