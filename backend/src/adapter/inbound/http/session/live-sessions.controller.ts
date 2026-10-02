import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import { ListLiveSessionsUseCase } from '@application/session';
import type { UserId } from '@domain/auth';
import { LOGGER } from '@shared/logging/logger';
import type { Logger } from '@shared/logging/logger';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { listLiveSessionsSchema, toLiveSessionListDto } from './live-sessions.dto';
import type { ListLiveSessionsQueryDto, LiveSessionListDto } from './live-sessions.dto';

/**
 * The live sessions of a folder — plan 08, B-07.
 *
 * The registry of live sessions is a map in memory and nothing else exposed it: the workbench could
 * not show what runs in the folder it has open. This is a read, so it is HTTP — a question with an
 * answer, never a stream of its own (docs/architecture/shared/05-websocket-protocol.md).
 *
 * | Status | When |
 * |---|---|
 * | `200` | the caller's live sessions in the folder and below it — possibly none |
 * | `400` | no `workspacePath`, or a relative one |
 * | `403` | outside every root of the caller, or a root of somebody else |
 * | `404` / `422` | the folder does not exist / is a file |
 */
@Controller('sessions')
@UseGuards(BearerAuthGuard)
export class LiveSessionsController {
  constructor(
    @Inject(ListLiveSessionsUseCase) private readonly listing: ListLiveSessionsUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Get()
  async list(
    @Query(new ZodPipe(listLiveSessionsSchema)) query: ListLiveSessionsQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<LiveSessionListDto> {
    const listed = toLiveSessionListDto(await this.listing.execute(query.workspacePath, userId));

    // The folder and the count: what was asked and how much came back. Never a summary or a prompt
    // — the list carries neither, and the log line is no place to start (S-24).
    this.logger.debug(
      {
        op: 'session.list',
        layer: 'adapter',
        workspacePath: query.workspacePath,
        count: listed.sessions.length,
      },
      'live sessions of a folder listed',
    );

    return listed;
  }
}
