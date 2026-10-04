import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import type { DeviceApprovedEvent } from '@application/auth';
import { NotifyDeviceApprovedUseCase } from '@application/notification';
import { DEVICE_APPROVED } from '@adapter/outbound/auth/emitter-device.events';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * The consumer that tells a phone it was just approved (plan 17, F3).
 *
 * **It does not wait.** The producer is the request approving the device, and a provider may not
 * be in its path; a failure is logged and goes no further — the phone checks again on its own when
 * it comes back to the foreground (D-16).
 */
@Injectable()
export class NotifyOnDeviceApproved {
  constructor(
    @Inject(NotifyDeviceApprovedUseCase) private readonly notify: NotifyDeviceApprovedUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @OnEvent(DEVICE_APPROVED)
  handle(event: DeviceApprovedEvent): void {
    const line = {
      op: 'push.send',
      layer: 'adapter',
      module: 'notification',
      kind: 'deviceApproved',
      deviceId: event.device.id,
    };

    void this.notify
      .execute(event.device)
      .then((outcome) => {
        this.logger.debug({ ...line, outcome }, 'the approved device was told');
      })
      .catch((error: unknown) => {
        this.logger.warn({ ...line, err: error }, 'the approved device could not be told');
      });
  }
}
