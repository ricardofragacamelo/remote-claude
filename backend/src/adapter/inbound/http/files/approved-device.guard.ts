import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { AuthorizeFolderReadUseCase } from '@application/auth';
import { DomainError } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { callerOf } from '../auth/bearer.guard';
import { callingInstallId } from '../devices/calling-device';

/**
 * Every `/files/*` route: the web as it always was, anything else only from an approved device
 * ([25 · B-32](../../../../../../docs/plans/25-mobile-file-browser/F1-norms.md#b-32--aparelho-aprovado-para-ler-a-pasta-)).
 *
 * It runs after `BearerAuthGuard`, which is who established the caller. A refusal is the device's
 * own `403` — `DEVICE_NOT_REGISTERED` or `DEVICE_REVOKED` —, logged in `debug` with the
 * installation and the route, and never with the token. The approval is read at every request, so
 * approving in the browser lets the next one through, and revoking stops it.
 */
@Injectable()
export class ApprovedDeviceGuard implements CanActivate {
  constructor(
    @Inject(AuthorizeFolderReadUseCase) private readonly authorize: AuthorizeFolderReadUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const installId = callingInstallId(request.headers);

    try {
      await this.authorize.execute(callerOf(request), installId);
    } catch (error) {
      this.logger.debug(
        {
          op: 'files.device',
          layer: 'adapter',
          module: 'files',
          installId,
          route: `${request.method} ${request.path}`,
          errorCode: error instanceof DomainError ? error.code : undefined,
        },
        'files refused to this device',
      );
      throw error;
    }

    return true;
  }
}
