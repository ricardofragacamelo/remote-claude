import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';

import { DescribePermissionUseCase } from '@application/permission';
import type { PermissionState } from '@application/permission';
import type { UserId } from '@domain/auth';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';

/**
 * The state of one permission request, for a client that was told about it by somebody else.
 *
 * A push opens the app on this route, and the push may be minutes late. So the app asks before
 * it renders: `200` with the pending request (and how many extensions are left) or with the
 * resolution (and who made it), `410` when the deadline already refused it, `404` for a request
 * this process does not know or that is not of that session, `403` for somebody else's. Every
 * outcome is a different status, and each is something the screen does differently
 * ([D-22](../../../../../docs/plans/02-mobile-approval/decisions.md#d-22--revalidar-é-perguntar-não-esperar)).
 *
 * Read-only on purpose. Answering stays on the socket, where the frame that asks carries the
 * `correlationId` the answer has to quote.
 */
@Controller('sessions/:sessionId/permissions')
@UseGuards(BearerAuthGuard)
export class PermissionController {
  constructor(
    @Inject(DescribePermissionUseCase) private readonly describe: DescribePermissionUseCase,
  ) {}

  @Get(':requestId')
  read(
    @Param('sessionId') sessionId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() userId: UserId,
  ): PermissionState {
    return this.describe.execute({ requestId, sessionId, userId });
  }
}
