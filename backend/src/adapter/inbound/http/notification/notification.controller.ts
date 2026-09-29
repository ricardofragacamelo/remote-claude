import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  DeleteNotificationsUseCase,
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
  RecordNotificationUseCase,
} from '@application/notification';
import type { UserId } from '@domain/auth';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { OmitFromLog } from '@shared/logging/omit-from-log.decorator';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import {
  listNotificationsSchema,
  markNotificationsReadSchema,
  recordNotificationSchema,
  toNotificationDto,
} from './notification.dto';
import type {
  ListNotificationsDto,
  MarkNotificationsReadDto,
  NotificationDto,
  NotificationPageDto,
  RecordNotificationDto,
} from './notification.dto';

/**
 * The history of this user's notification centre (plan 06, B-40).
 *
 * Every route is the caller's and only theirs. The writes that name nothing that exists still
 * answer `204` — "make it read", "make it gone" have the same answer whether or not there was
 * anything to do. The WebSocket contract does not change: windows converge by reading this again
 * when they regain focus and when they reconnect (06 · D-17).
 */
@Controller('notifications')
@UseGuards(BearerAuthGuard)
export class NotificationController {
  constructor(
    @Inject(RecordNotificationUseCase) private readonly recordEntry: RecordNotificationUseCase,
    @Inject(ListNotificationsUseCase) private readonly list: ListNotificationsUseCase,
    @Inject(MarkNotificationsReadUseCase) private readonly markRead: MarkNotificationsReadUseCase,
    @Inject(DeleteNotificationsUseCase) private readonly deleteEntries: DeleteNotificationsUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** A page, newest first, with how many are unread. */
  @Get()
  async read(
    @Query(new ZodPipe(listNotificationsSchema)) query: ListNotificationsDto,
    @CurrentUser() userId: UserId,
  ): Promise<NotificationPageDto> {
    const page = await this.list.execute(userId, query.cursor ?? null);

    return {
      items: page.entries.map(toNotificationDto),
      unread: page.unread,
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Keeps a notification: `201` when it is new, `200` with the one already kept under the same
   * client id — the client that never got the answer and sent it again.
   *
   * The parameters never reach the log, neither the interceptor's line nor this one: the edge says
   * the severity, the key and the count (plan 06, S-178).
   */
  @Post()
  @HttpCode(201)
  @OmitFromLog('params')
  async record(
    @Body(new ZodPipe(recordNotificationSchema)) body: RecordNotificationDto,
    @CurrentUser() userId: UserId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<NotificationDto> {
    const recorded = await this.recordEntry.execute({ userId, ...body });

    this.logger.debug(
      {
        op: 'notification.recorded',
        layer: 'adapter',
        module: 'notification',
        severity: body.severity,
        messageKey: body.messageKey,
        count: body.count,
        created: recorded.created,
      },
      'notification recorded',
    );

    if (!recorded.created) {
      response.status(200);
    }

    return toNotificationDto(recorded.entry);
  }

  /** Marks entries read — `204` also for an id that is not there, or one already read. */
  @Put('read')
  @HttpCode(204)
  async readSome(
    @Body(new ZodPipe(markNotificationsReadSchema)) body: MarkNotificationsReadDto,
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.markRead.execute(userId, body.ids);
  }

  @Put('read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() userId: UserId): Promise<void> {
    await this.markRead.execute(userId, null);
  }

  /** Deletes one entry — `204` also when it is not there, or is somebody else's. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() userId: UserId): Promise<void> {
    await this.deleteEntries.execute(userId, id);
  }

  /** Deletes every entry of this user. */
  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser() userId: UserId): Promise<void> {
    await this.deleteEntries.execute(userId, null);
  }
}
