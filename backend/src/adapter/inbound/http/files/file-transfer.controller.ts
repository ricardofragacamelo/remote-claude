import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  DownloadArchiveUseCase,
  PreflightUploadUseCase,
  ReadLimitsUseCase,
  ReadRawUseCase,
  UploadFilesUseCase,
} from '@application/files';
import type { OutgoingBytes, RawContent } from '@application/files';
import type { UserId } from '@domain/auth';
import { toValidationError } from '@shared/errors/zod';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { dispositionOf } from './content-disposition';
import {
  archiveQuerySchema,
  preflightBodySchema,
  rawQuerySchema,
  toPreflightCommand,
  toPreflightDto,
  toUploadCommand,
  toUploadDto,
  uploadFieldsSchema,
} from './file-transfer.dto';
import type {
  ArchiveQueryDto,
  LimitsDto,
  PreflightBodyDto,
  PreflightDto,
  RawQueryDto,
} from './file-transfer.dto';
import { MultipartUpload } from './multipart-upload.reader';

/**
 * Previews and transfer — plan 07, F7: the ceilings, the raw bytes of a file, a zip of a selection,
 * and files sent from the desktop ([D-16](../../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos),
 * [D-18](../../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)).
 *
 * A controller of its own beside `FilesController`, under the same prefix and the same rules: every
 * route names the folder of the tab and a path relative to it, and Bearer is the only credential —
 * never a token in the URL, which is why the web fetches these into a blob rather than pointing an
 * `<img>` or an `<a>` at them.
 *
 * What it streams it streams through `pipeline`: a client that goes away destroys the response,
 * and the source is closed with it — the descriptor of a file, the zip and the file it was reading.
 * A failure after the first byte cuts the connection; a client never gets a body that looks whole
 * and is not. Both ends are logged at `debug` by the interceptor; how a stream ended is logged
 * here, never what it carried.
 *
 * See docs/architecture/backend/03-modules.md#files for every status.
 */
@Controller('files')
@UseGuards(BearerAuthGuard)
export class FileTransferController {
  constructor(
    @Inject(ReadLimitsUseCase) private readonly limits: ReadLimitsUseCase,
    @Inject(ReadRawUseCase) private readonly raw: ReadRawUseCase,
    @Inject(DownloadArchiveUseCase) private readonly archiver: DownloadArchiveUseCase,
    @Inject(PreflightUploadUseCase) private readonly preflighter: PreflightUploadUseCase,
    @Inject(UploadFilesUseCase) private readonly uploader: UploadFilesUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** The ceilings a client has to know before it starts: editing, download, zip, upload, history. */
  @Get('limits')
  readLimits(): LimitsDto {
    return this.limits.execute();
  }

  /**
   * A file's bytes: `200`, or `206` for one range. The headers of D-18 go first, so a refusal
   * carries them too: whatever this route answers is never a document of the product's origin.
   */
  @Get('raw')
  async readRaw(
    @Query(new ZodPipe(rawQuerySchema)) query: RawQueryDto,
    @Headers('range') range: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() userId: UserId,
    @Res() response: Response,
  ): Promise<void> {
    neverADocument(response);

    const content = await this.raw.execute(
      {
        folder: query.folder,
        path: query.path,
        range: range ?? null,
        ifMatch: ifMatch ?? null,
        download: query.download,
      },
      userId,
    );

    describeRaw(response, content);
    await this.streamed(response, content.body, 'files.raw.sent');
  }

  /** A zip of the selection, streamed — measured and in the trail before the first byte. */
  @Get('archive')
  async readArchive(
    @Res() response: Response,
    @Query(new ZodPipe(archiveQuerySchema)) query: ArchiveQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    neverADocument(response);

    const archive = await this.archiver.execute(
      { folder: query.folder, paths: query.path },
      userId,
    );

    response.status(200);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', dispositionOf('attachment', archive.fileName));
    await this.streamed(response, archive.body, 'files.archive.sent');
  }

  /** What is already where each item of an upload would go — asked before anything is sent. */
  @Post('upload/preflight')
  @HttpCode(200)
  async preflight(
    @Body(new ZodPipe(preflightBodySchema)) body: PreflightBodyDto,
    @CurrentUser() userId: UserId,
  ): Promise<PreflightDto> {
    return toPreflightDto(await this.preflighter.execute(toPreflightCommand(body), userId));
  }

  /**
   * Files from the desktop: `multipart/form-data`, read as a stream — the fields, then one `file`
   * part per item of the manifest, in its order. `200` when every item was written, `207` when any
   * failed, each with its own outcome; a manifest refused whole has the status of its reason.
   */
  @Post('upload')
  async upload(
    @Req() request: Request,
    @CurrentUser() userId: UserId,
    @Res() response: Response,
  ): Promise<void> {
    const ceilings = this.limits.execute();
    const form = await MultipartUpload.open(request, {
      fileBytes: ceilings.uploadMaxBytes,
      files: ceilings.uploadMaxEntries,
    });

    try {
      const fields = uploadFieldsSchema.safeParse(form.fields);

      if (!fields.success) {
        throw toValidationError(fields.error);
      }

      const outcomes = await this.uploader.execute(toUploadCommand(fields.data), form, userId);
      const failed = outcomes.filter((outcome) => outcome.status === 'failed').length;

      this.logger.debug(
        { op: 'files.upload', layer: 'adapter', items: outcomes.length, failed },
        'files.upload done',
      );
      response.status(failed > 0 ? 207 : 200).json(toUploadDto(outcomes));
    } finally {
      form.release();
    }
  }

  /** Sends the bytes and closes their source — at the end, on a failure, or when the client left. */
  private async streamed(response: Response, body: OutgoingBytes, op: string): Promise<void> {
    try {
      await pipeline(Readable.from(body.chunks), response);
      this.logger.debug({ op, layer: 'adapter', outcome: 'done' }, `${op} done`);
    } catch (error) {
      // A client that went away, or a source that failed after the first byte: either way the
      // connection is cut, and nothing more can be said to it.
      this.logger.debug({ op, layer: 'adapter', outcome: 'cut', err: error }, `${op} cut`);
    } finally {
      await body.close();
    }
  }
}

/**
 * `nosniff` and `sandbox`, **always** (D-18): a browser that navigates to these bytes anyway gets
 * neither a type guessed from them nor an origin to run script in.
 */
function neverADocument(response: Response): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', 'sandbox');
}

/** The status and headers of a file's bytes: the version, the part, the type, the disposition. */
function describeRaw(response: Response, content: RawContent): void {
  response.status(content.range === null ? 200 : 206);
  response.setHeader('ETag', content.etag.value);
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', content.contentType);
  response.setHeader('Content-Length', String(content.length));
  response.setHeader(
    'Content-Disposition',
    dispositionOf(content.inline ? 'inline' : 'attachment', content.path.name),
  );

  if (content.range !== null) {
    response.setHeader(
      'Content-Range',
      `bytes ${String(content.range.start)}-${String(content.range.end)}/${String(content.size)}`,
    );
  }
}
