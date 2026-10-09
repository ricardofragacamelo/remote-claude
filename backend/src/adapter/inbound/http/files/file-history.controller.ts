import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  ListHistoryUseCase,
  ReadHistoryContentUseCase,
  RestoreHistoryEntryUseCase,
} from '@application/files';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { ApprovedDeviceGuard } from './approved-device.guard';
import {
  HISTORY_PAGE_SIZE,
  historyContentQuerySchema,
  historyEntryIdSchema,
  historyQuerySchema,
  restoreBodySchema,
  toHistoryPageDto,
  toRestoredEntryDto,
} from './file-history.dto';
import type {
  HistoryContentQueryDto,
  HistoryPageDto,
  HistoryQueryDto,
  RestoreBodyDto,
  RestoredEntryDto,
} from './file-history.dto';
import { toFileContentDto } from './files.dto';
import type { FileContentDto } from './files.dto';

/**
 * The local history of an open folder — plan 07, B-58: the versions, what one held, and putting one
 * back ([D-17](../../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local)).
 *
 * A controller of its own beside `FilesController`, under the same prefix and the same rules: every
 * route names the folder of the tab, revalidated at every request, and an entry outside it is `404`
 * like one that does not exist (S-341). The entry's id is the one URL segment — a ULID, never a
 * path. A restore is an ordinary write: `If-Match` of the current file to replace it, none to
 * re-create the deleted one.
 *
 * See docs/architecture/backend/03-modules.md#files for every status.
 */
@Controller('files/history')
@UseGuards(BearerAuthGuard, ApprovedDeviceGuard)
export class FileHistoryController {
  constructor(
    @Inject(ListHistoryUseCase) private readonly listing: ListHistoryUseCase,
    @Inject(ReadHistoryContentUseCase) private readonly reader: ReadHistoryContentUseCase,
    @Inject(RestoreHistoryEntryUseCase) private readonly restorer: RestoreHistoryEntryUseCase,
  ) {}

  /** A page of versions, newest first — of one path, of the folder, or the recently deleted. */
  @Get()
  async list(
    @Query(new ZodPipe(historyQuerySchema)) query: HistoryQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<HistoryPageDto> {
    const page = await this.listing.execute(
      {
        folder: query.folder,
        path: query.path ?? null,
        reason: query.reason ?? null,
        deleted: query.deleted,
        cursor: query.cursor === undefined ? null : Number(query.cursor),
        limit: query.limit ?? HISTORY_PAGE_SIZE,
      },
      userId,
    );

    return toHistoryPageDto(page, userId);
  }

  /** What a version held, as `GET /files/content` answers a file — with its `ETag`. */
  @Get(':entryId/content')
  async content(
    @Param('entryId', new ZodPipe(historyEntryIdSchema)) entryId: string,
    @Query(new ZodPipe(historyContentQuerySchema)) query: HistoryContentQueryDto,
    @CurrentUser() userId: UserId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<FileContentDto> {
    const opened = await this.reader.execute(
      { folder: query.folder, entryId, encoding: query.encoding ?? null },
      userId,
    );

    response.setHeader('ETag', opened.etag.value);
    return toFileContentDto(opened);
  }

  /** Puts a version back: over the current file named in `If-Match`, or where nothing is. */
  @Post(':entryId/restore')
  @HttpCode(200)
  async restore(
    @Param('entryId', new ZodPipe(historyEntryIdSchema)) entryId: string,
    @Body(new ZodPipe(restoreBodySchema)) body: RestoreBodyDto,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() userId: UserId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RestoredEntryDto> {
    const restored = await this.restorer.execute(
      {
        folder: body.folder,
        entryId,
        ifMatch: ifMatch ?? null,
        confirmSensitive: body.confirmSensitive,
      },
      userId,
    );

    if (restored.etag !== null) {
      response.setHeader('ETag', restored.etag.value);
    }

    return toRestoredEntryDto(restored);
  }
}
