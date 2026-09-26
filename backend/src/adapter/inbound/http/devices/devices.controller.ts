import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApproveDeviceUseCase,
  ListDevicesUseCase,
  RegisterDeviceUseCase,
  RevokeDeviceUseCase,
} from '@application/auth';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { CallingDevice } from './calling-device';
import { registerDeviceSchema, toDeviceDto } from './devices.dto';
import type { DeviceDto, DeviceListDto, RegisterDeviceBody } from './devices.dto';

/**
 * The installations of the app, and which of them may decide something.
 *
 * Four routes and four different statuses, each one load-bearing. `201` says a registration was
 * recorded — it does **not** say the device may do anything, which is why the body carries the
 * status and the app shows it. `403` is a device trying to approve a device. `404` is an id that
 * is not this user's, answered the same as one that does not exist: telling a caller that an id
 * exists and is not theirs is telling them an id exists.
 *
 * See docs/architecture/shared/08-authentication.md#device-e-o-canal-mobile.
 */
@Controller('devices')
@UseGuards(BearerAuthGuard)
export class DevicesController {
  constructor(
    @Inject(RegisterDeviceUseCase) private readonly register: RegisterDeviceUseCase,
    @Inject(ListDevicesUseCase) private readonly list: ListDevicesUseCase,
    @Inject(ApproveDeviceUseCase) private readonly approve: ApproveDeviceUseCase,
    @Inject(RevokeDeviceUseCase) private readonly revoke: RevokeDeviceUseCase,
  ) {}

  /**
   * The app saying which installation it is. Idempotent: calling it again updates the row.
   *
   * `201` on both, and on purpose. The second call is not "nothing happened" — the name, the app
   * version and the push token are what it came to update, and answering `200` would make a client
   * branch on something that means the same thing.
   */
  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodPipe(registerDeviceSchema)) body: RegisterDeviceBody,
    @CurrentUser() userId: UserId,
  ): Promise<DeviceDto> {
    return toDeviceDto(
      await this.register.execute({
        userId,
        installId: body.installId,
        name: body.name,
        platform: body.platform,
        appVersion: body.appVersion,
        pushToken: body.pushToken ?? null,
        locale: body.locale ?? null,
      }),
    );
  }

  /** This caller's devices, most recently seen first. Only theirs. */
  @Get()
  async read(@CurrentUser() userId: UserId): Promise<DeviceListDto> {
    return { devices: (await this.list.execute(userId)).map(toDeviceDto) };
  }

  /** Letting a device decide. Refused when the caller is itself a device (S-06). */
  @Post(':deviceId/approval')
  @HttpCode(200)
  async allow(
    @Param('deviceId') deviceId: string,
    @CurrentUser() userId: UserId,
    @CallingDevice() callerInstallId: string | null,
  ): Promise<DeviceDto> {
    return toDeviceDto(await this.approve.execute({ userId, deviceId, callerInstallId }));
  }

  /**
   * Taking a device out.
   *
   * `DELETE` on the approval rather than on the device, because the row stays: the record that a
   * phone was revoked, and when, is the point of revoking it.
   */
  @Delete(':deviceId/approval')
  @HttpCode(200)
  async deny(
    @Param('deviceId') deviceId: string,
    @CurrentUser() userId: UserId,
  ): Promise<DeviceDto> {
    return toDeviceDto(await this.revoke.execute(userId, deviceId));
  }
}
