import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  CopyEntryUseCase,
  CreateEntryUseCase,
  DeleteEntryUseCase,
  ListTreeUseCase,
  MoveEntryUseCase,
  ReadFileUseCase,
  SaveFileUseCase,
} from '@application/files';
import type { UserId } from '@domain/auth';
import { OmitFromLog } from '@shared/logging/omit-from-log.decorator';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { ApprovedDeviceGuard } from './approved-device.guard';
import { toKeptDeleteDto } from './file-history.dto';
import type { KeptDeleteDto } from './file-history.dto';
import {
  contentQuerySchema,
  createBodySchema,
  deleteQuerySchema,
  relocateBodySchema,
  saveBodySchema,
  toEntryDto,
  toFileContentDto,
  toSavedFileDto,
  toTreeDto,
  treeQuerySchema,
} from './files.dto';
import type {
  ContentQueryDto,
  CreateBodyDto,
  DeleteQueryDto,
  EntryDto,
  FileContentDto,
  RelocateBodyDto,
  SaveBodyDto,
  SavedFileDto,
  TreeDto,
  TreeQueryDto,
} from './files.dto';

/**
 * The files of an open folder: the tree, the contents, and the person's writes — plan 07, F1 and F2.
 *
 * Every route names the **folder of the tab** and a path relative to it, never one absolute path:
 * the fence is the open folder, and the server checks both at every request
 * ([07 · D-11](../../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-11--a-raiz-do-explorer-é-a-pasta-aberta)).
 * Paths travel in the query string or the body, never as a URL segment, for the reason the
 * `workspace` routes give.
 *
 * Versions travel as HTTP has them: `ETag` on what is read and written, `If-None-Match` on a read,
 * `If-Match` on a save — required there — and on a delete. A body never reaches the log with a
 * file's contents in it (`@OmitFromLog('content')`), and neither does the disk adapter (S-61).
 *
 * See docs/architecture/backend/03-modules.md#files for every status.
 */
@Controller('files')
@UseGuards(BearerAuthGuard, ApprovedDeviceGuard)
export class FilesController {
  constructor(
    @Inject(ListTreeUseCase) private readonly tree: ListTreeUseCase,
    @Inject(ReadFileUseCase) private readonly reader: ReadFileUseCase,
    @Inject(SaveFileUseCase) private readonly saver: SaveFileUseCase,
    @Inject(CreateEntryUseCase) private readonly creator: CreateEntryUseCase,
    @Inject(MoveEntryUseCase) private readonly mover: MoveEntryUseCase,
    @Inject(CopyEntryUseCase) private readonly copier: CopyEntryUseCase,
    @Inject(DeleteEntryUseCase) private readonly deleter: DeleteEntryUseCase,
  ) {}

  /** One level of a folder — `422` for a file, `404` for nothing there. */
  @Get('tree')
  async readTree(
    @Query(new ZodPipe(treeQuerySchema)) query: TreeQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<TreeDto> {
    return toTreeDto(await this.tree.execute(query, userId));
  }

  /**
   * A file's text and its version — or `304` with no body when `If-None-Match` names it.
   *
   * `413` past the editing ceiling, `415` for a binary or an undecodable file, `422` for anything
   * that is not a regular file.
   */
  @Get('content')
  async readContent(
    @Query(new ZodPipe(contentQuerySchema)) query: ContentQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @CurrentUser() userId: UserId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<FileContentDto | undefined> {
    const read = await this.reader.execute(
      {
        folder: query.folder,
        path: query.path,
        encoding: query.encoding ?? null,
        ifNoneMatch: ifNoneMatch ?? null,
      },
      userId,
    );

    response.setHeader('ETag', read.etag.value);

    if (read.kind === 'notModified') {
      response.status(304);
      return undefined;
    }

    return toFileContentDto(read);
  }

  /**
   * Saves a file over the version named in `If-Match`. `428` without it, `412` with the version on
   * disk when it is another — Claude wrote since — and `200` without writing when the disk already
   * holds this exact text: the retry of a save whose answer got lost.
   */
  @Put('content')
  @OmitFromLog('content')
  async save(
    @Body(new ZodPipe(saveBodySchema)) body: SaveBodyDto,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() userId: UserId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SavedFileDto> {
    const saved = await this.saver.execute({ ...body, ifMatch: ifMatch ?? null }, userId);

    response.setHeader('ETag', saved.etag.value);
    return toSavedFileDto(saved);
  }

  /** Creates a file or a folder: `201` with `Location`, and the `ETag` of a file. Never over anything. */
  @Post()
  @HttpCode(201)
  @OmitFromLog('content')
  async create(
    @Body(new ZodPipe(createBodySchema)) body: CreateBodyDto,
    @CurrentUser() userId: UserId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EntryDto> {
    const created = await this.creator.execute({ ...body, content: body.content ?? '' }, userId);

    locate(
      response,
      body.folder,
      created.path.relative,
      body.kind === 'directory' ? 'tree' : 'content',
    );

    if (created.etag !== null) {
      response.setHeader('ETag', created.etag.value);
    }

    return toEntryDto(created);
  }

  /** Renames or moves an entry — never over another one. */
  @Post('move')
  @HttpCode(200)
  async move(
    @Body(new ZodPipe(relocateBodySchema)) body: RelocateBodyDto,
    @CurrentUser() userId: UserId,
  ): Promise<EntryDto> {
    return toEntryDto(await this.mover.execute(relocateCommand(body), userId));
  }

  /** Copies an entry: `201` with `Location`. Never over another one. */
  @Post('copy')
  @HttpCode(201)
  async copy(
    @Body(new ZodPipe(relocateBodySchema)) body: RelocateBodyDto,
    @CurrentUser() userId: UserId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EntryDto> {
    const copied = await this.copier.execute(relocateCommand(body), userId);

    locate(
      response,
      body.folder,
      copied.path.relative,
      copied.kind === 'directory' ? 'tree' : 'content',
    );
    return toEntryDto(copied);
  }

  /**
   * Deletes an entry: `204`. A folder with something in it answers `409` with the count, and is
   * deleted only when the request sends that count back. With `keepInHistory`, `200` with what the
   * local history kept, for an undo — and what does not fit is not deleted (F8).
   */
  @Delete()
  @HttpCode(204)
  async remove(
    @Query(new ZodPipe(deleteQuerySchema)) query: DeleteQueryDto,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() userId: UserId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<KeptDeleteDto | undefined> {
    const deleted = await this.deleter.execute(
      {
        folder: query.folder,
        path: query.path,
        recursive: query.recursive,
        expectedEntries: query.expectedEntries ?? null,
        ifMatch: ifMatch ?? null,
        confirmSensitive: query.confirmSensitive,
        keepInHistory: query.keepInHistory,
      },
      userId,
    );

    if (deleted.kept === null) {
      return undefined;
    }

    response.status(200);
    return toKeptDeleteDto(deleted.kept);
  }
}

function relocateCommand(body: RelocateBodyDto): Parameters<MoveEntryUseCase['execute']>[0] {
  return {
    folder: body.folder,
    from: body.from,
    to: body.to,
    ifMatch: body.ifMatch ?? null,
    confirmSensitive: body.confirmSensitive,
  };
}

/** The `Location` of what a request created: where it is read back from. */
function locate(response: Response, folder: string, path: string, route: 'tree' | 'content'): void {
  const query = new URLSearchParams({ folder, path });
  response.setHeader('Location', `/files/${route}?${query.toString()}`);
}
