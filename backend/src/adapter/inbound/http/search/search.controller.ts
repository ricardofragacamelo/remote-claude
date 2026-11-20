import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type {
  SearchLocatePayload,
  SearchReplaceApplyResultPayload,
} from '@remote-claude/contracts';

import {
  FindPathsUseCase,
  ProcessAbortedError,
  SearchReplaceApplyUseCase,
  SearchReplacePreviewUseCase,
  SearchTextUseCase,
} from '@application/search';
import type { SearchTruncation } from '@application/search';
import type { UserId } from '@domain/auth';
import { DomainError } from '@domain/shared';
import { SearchEngineFailedError } from '@domain/search';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import {
  locateQuerySchema,
  searchReplaceApplyBodySchema,
  searchReplacePreviewBodySchema,
  searchTextBodySchema,
  toLocateDto,
  toOnlyPathsAndContextLines,
  toSearchQueryFields,
  toSearchReplaceApplyResultDto,
  toSearchReplacePreviewEndFrame,
  toSearchReplacePreviewErrorFrame,
  toSearchReplacePreviewFileFrame,
  toSearchTextEndFrame,
  toSearchTextErrorFrame,
  toSearchTextFileFrame,
} from './search.dto';
import type {
  LocateQueryDto,
  SearchReplaceApplyBodyDto,
  SearchReplacePreviewBodyDto,
  SearchTextBodyDto,
} from './search.dto';

/**
 * Finding files and text inside an open folder, and replacing in batch — plan 11.
 *
 * Every route names the pasta da aba (`folder`, absolute), resolved before any process runs. See
 * docs/architecture/backend/03-modules.md#search for the whole contract.
 */
@Controller('search')
@UseGuards(BearerAuthGuard)
export class SearchController {
  constructor(
    @Inject(FindPathsUseCase) private readonly findPaths: FindPathsUseCase,
    @Inject(SearchTextUseCase) private readonly searchTextUseCase: SearchTextUseCase,
    @Inject(SearchReplacePreviewUseCase)
    private readonly replacePreviewUseCase: SearchReplacePreviewUseCase,
    @Inject(SearchReplaceApplyUseCase)
    private readonly replaceApplyUseCase: SearchReplaceApplyUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * The locator: Quick Open, and the `@` of the composer (plan 08). A keystroke that fires a new
   * query aborts the request behind the previous one; a cold listing nobody is left waiting for
   * dies with it, one still shared with another caller keeps running for their sake (S-62).
   */
  @Get('files')
  async locate(
    @Query(new ZodPipe(locateQuerySchema)) query: LocateQueryDto,
    @CurrentUser() userId: UserId,
    @Req() request: Request,
  ): Promise<SearchLocatePayload> {
    const { signal, stop } = requestAbortSignal(request);
    try {
      const result = await this.findPaths.execute(
        {
          folder: query.folder,
          userId,
          query: query.query,
          kinds: query.kinds,
          prefer: query.prefer,
          includeIgnored: query.includeIgnored,
          ...(query.limit === undefined ? {} : { limit: query.limit }),
        },
        signal,
      );

      return toLocateDto(result);
    } finally {
      stop();
    }
  }

  /**
   * Text search, in a fluxo NDJSON (D-02): every refusal detectable before the first byte
   * (validation, the pattern, the rate limit) answers with its own status, **before** this opens
   * the stream — only once {@link SearchTextUseCase.execute} has actually returned does a line go
   * out, and the status is already `200` by then (B-03).
   */
  @Post('text')
  async searchText(
    @Body(new ZodPipe(searchTextBodySchema)) body: SearchTextBodyDto,
    @CurrentUser() userId: UserId,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await withRequestAbort(request, response, async (signal) => {
      const result = await this.searchTextUseCase.execute(
        { ...toSearchQueryFields(body, userId), ...toOnlyPathsAndContextLines(body) },
        signal,
      );

      ndjsonHeaders(response);
      await this.streamed(
        result.files,
        result.outcome,
        response,
        toSearchTextFileFrame,
        toSearchTextEndFrame,
        toSearchTextErrorFrame,
        'search.text',
      );
    });
  }

  /**
   * The replace preview (B-11): the same stream shape as `/search/text`, with the resolved
   * replacement text on every match and the file's own ETag (D-02).
   */
  @Post('replace/preview')
  async replacePreview(
    @Body(new ZodPipe(searchReplacePreviewBodySchema)) body: SearchReplacePreviewBodyDto,
    @CurrentUser() userId: UserId,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await withRequestAbort(request, response, async (signal) => {
      const result = await this.replacePreviewUseCase.execute(
        {
          ...toSearchQueryFields(body, userId),
          ...toOnlyPathsAndContextLines(body),
          replacement: body.replacement,
          preserveCase: body.preserveCase,
        },
        signal,
      );

      ndjsonHeaders(response);
      await this.streamed(
        result.files,
        result.outcome,
        response,
        toSearchReplacePreviewFileFrame,
        toSearchReplacePreviewEndFrame,
        toSearchReplacePreviewErrorFrame,
        'search.replace.preview',
      );
    });
  }

  /** Applying the replace (B-11, D-05) — a single report, never a stream: nothing to show live. */
  @Post('replace')
  @HttpCode(200)
  async replaceApply(
    @Body(new ZodPipe(searchReplaceApplyBodySchema)) body: SearchReplaceApplyBodyDto,
    @CurrentUser() userId: UserId,
    @Req() request: Request,
  ): Promise<SearchReplaceApplyResultPayload> {
    const controller = new AbortController();
    const onClose = (): void => controller.abort();
    request.on('close', onClose);

    try {
      const report = await this.replaceApplyUseCase.execute(
        {
          ...toSearchQueryFields(body, userId),
          replacement: body.replacement,
          preserveCase: body.preserveCase,
          files: body.files,
        },
        controller.signal,
      );

      return toSearchReplaceApplyResultDto(report);
    } finally {
      request.off('close', onClose);
    }
  }

  /** Writes every `file` line, then the one closing line — `end` on success, `error` after it. */
  private async streamed<TFile, TFrame>(
    files: AsyncIterable<TFile>,
    outcome: Promise<{ readonly truncated: SearchTruncation; readonly skipped: number }>,
    response: Response,
    toFileFrame: (file: TFile) => TFrame,
    toEndFrame: (truncated: SearchTruncation, skipped: number) => TFrame,
    toErrorFrame: (error: DomainError) => TFrame,
    op: string,
  ): Promise<void> {
    try {
      for await (const file of files) {
        response.write(`${JSON.stringify(toFileFrame(file))}\n`);
      }
      const settled = await outcome;
      response.end(`${JSON.stringify(toEndFrame(settled.truncated, settled.skipped))}\n`);
    } catch (error) {
      if (error instanceof ProcessAbortedError) {
        // The client already left — nothing more can be said to it (S-101).
        this.logger.debug({ op, layer: 'adapter', outcome: 'aborted' }, `${op} aborted`);
        response.end();
        return;
      }
      const engineError =
        error instanceof DomainError ? error : new SearchEngineFailedError(String(error));
      this.logger.debug(
        { op, layer: 'adapter', outcome: 'failed', err: engineError },
        `${op} failed mid-stream`,
      );
      response.end(`${JSON.stringify(toErrorFrame(engineError))}\n`);
    }
  }
}

/** D-02's three headers — never cached, never buffered by a proxy, never anything but NDJSON. */
function ndjsonHeaders(response: Response): void {
  response.status(200);
  response.setHeader('Content-Type', 'application/x-ndjson');
  response.setHeader('Cache-Control', 'no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
}

/**
 * The non-streaming counterpart of {@link withRequestAbort} — a plain route that returns one JSON
 * body has no `response` to guard with, but still needs its own use case to hear a client that
 * left (S-62). `stop` must run once the route is done, successful or not, so a request that
 * finished normally never leaves a dangling `close` listener behind.
 */
function requestAbortSignal(request: Request): { signal: AbortSignal; stop: () => void } {
  const controller = new AbortController();
  const onClose = (): void => controller.abort();
  request.on('close', onClose);

  return { signal: controller.signal, stop: () => request.off('close', onClose) };
}

/**
 * Ties a use case's `AbortSignal` to the HTTP request's own close — the one piece every
 * streaming route of this controller needs identically, before it even knows whether it will
 * open a stream or refuse before the first byte.
 */
async function withRequestAbort(
  request: Request,
  response: Response,
  run: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const controller = new AbortController();
  const onClose = (): void => {
    if (!response.writableEnded) controller.abort();
  };
  request.on('close', onClose);

  try {
    await run(controller.signal);
  } finally {
    request.off('close', onClose);
  }
}
