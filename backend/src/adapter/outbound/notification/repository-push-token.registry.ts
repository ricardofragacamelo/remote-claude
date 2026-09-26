import { Inject, Injectable } from '@nestjs/common';

import { ForgetPushTokenUseCase } from '@application/auth';
import type { PushTokenRegistry } from '@application/notification';
import type { Device } from '@domain/auth';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * Erasing a token the provider refused, and nothing else.
 *
 * Not revoking the device, deliberately: revoking would charge a fresh approval through the
 * browser every time the operating system rotates a token, and the phone would drop out of the
 * flow for a reason nobody caused
 * ([D-13](../../../../../docs/plans/02-mobile-approval/decisions.md#d-13--o-token-que-morre-calado)).
 *
 * It is `info` and not `warn`: this is the ordinary end of a token's life, and the device starts
 * receiving again the next time the app opens and re-sends.
 */
@Injectable()
export class RepositoryPushTokenRegistry implements PushTokenRegistry {
  constructor(
    @Inject(ForgetPushTokenUseCase) private readonly forgetToken: ForgetPushTokenUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async forget(device: Device): Promise<void> {
    await this.forgetToken.execute(device.userId, device.id);

    this.logger.info(
      {
        op: 'push.send',
        layer: 'adapter',
        module: 'notification',
        deviceId: device.id,
      },
      'the provider refused this push token; it is erased and the device stays approved',
    );
  }
}
