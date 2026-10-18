import { Controller, Get, Inject, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import {
  TranscriptStoreRegistry,
  ListTranscriptsUseCase,
  ReadPromptImageUseCase,
  ReadToolResultUseCase,
  ReadTranscriptUseCase,
} from '@application/transcript';
import type { UserId } from '@domain/auth';
import type { ConversationRef } from '@domain/engine';
import { TranscriptNotFoundError } from '@domain/transcript';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import {
  blockIdSchema,
  DEFAULT_PAGE_SIZE,
  engineSchema,
  listTranscriptsSchema,
  readTranscriptSchema,
  subagentToolSchema,
  toSessionListCursor,
  toSubagentPageDto,
  toTranscriptListDto,
  toToolResultDto,
  toTranscriptPageDto,
  transcriptIdSchema,
} from './transcript.dto';
import type {
  ListTranscriptsQueryDto,
  ReadTranscriptQueryDto,
  SubagentPageDto,
  ToolResultDto,
  TranscriptListDto,
  TranscriptPageDto,
} from './transcript.dto';

/**
 * The history: what was said on this machine, including what began in the editor.
 *
 * Two routes, both reads, both scoped by who asks. The answers each mean one thing:
 *
 * | Status | When |
 * |---|---|
 * | `200` | a page — possibly empty, which is an answer too (S-03) |
 * | `400` | a query this server cannot run: a malformed id or cursor, a page size out of bounds, a cursor whose message is gone (S-69) |
 * | `403` | a `workspacePath` outside the caller's roots (S-73) |
 * | `404` | a conversation that does not exist **or** is not the caller's — the same answer on purpose (S-04, S-56) |
 * | `413` / `415` | the image of a prompt above the ceiling, or of a type never served (plan 22, D-10) |
 * | `502` / `504` | the engine failed, or did not answer in time (S-05, S-68) |
 */
@Controller('transcripts')
@UseGuards(BearerAuthGuard)
export class TranscriptController {
  constructor(
    @Inject(ListTranscriptsUseCase) private readonly listing: ListTranscriptsUseCase,
    @Inject(ReadTranscriptUseCase) private readonly reading: ReadTranscriptUseCase,
    @Inject(ReadToolResultUseCase) private readonly results: ReadToolResultUseCase,
    @Inject(ReadPromptImageUseCase) private readonly images: ReadPromptImageUseCase,
    @Inject(TranscriptStoreRegistry) private readonly engines: TranscriptStoreRegistry,
  ) {}

  /**
   * The conversation a route names. An engine that is not enabled is a conversation that does not
   * exist — `404`, the same answer as an id nobody has (S-38); an id the engine never hands out is
   * `400`.
   */
  private conversation(engine: string, id: string): ConversationRef {
    if (!this.engines.has(engine)) {
      throw new TranscriptNotFoundError(id);
    }
    return this.engines.conversation(engine, id);
  }

  /** The conversations of one workspace, most recently written first. */
  @Get()
  async list(
    @Query(new ZodPipe(listTranscriptsSchema)) query: ListTranscriptsQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<TranscriptListDto> {
    const page = await this.listing.execute({
      userId,
      workspacePath: query.workspacePath,
      includeSubfolders: query.includeSubfolders === 'true',
      after: toSessionListCursor(query.cursor),
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
    });

    return toTranscriptListDto(page);
  }

  /** One page of a conversation, from the latest message backwards. */
  @Get(':engine/:id/messages')
  read(
    @Param('engine', new ZodPipe(engineSchema)) engine: string,
    @Param('id', new ZodPipe(transcriptIdSchema)) id: string,
    @Query(new ZodPipe(readTranscriptSchema)) query: ReadTranscriptQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<TranscriptPageDto> {
    return this.page(this.conversation(engine, id), query, userId);
  }

  @Get(':engine/:id/subagents/:toolUseId/messages')
  readSubagent(
    @Param('engine', new ZodPipe(engineSchema)) engine: string,
    @Param('id', new ZodPipe(transcriptIdSchema)) id: string,
    @Param('toolUseId', new ZodPipe(subagentToolSchema)) toolUseId: string,
    @Query(new ZodPipe(readTranscriptSchema)) query: ReadTranscriptQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<SubagentPageDto> {
    return this.subagentPage(this.conversation(engine, id), toolUseId, query, userId);
  }

  @Get(':engine/:id/tools/:toolUseId/result')
  readToolResult(
    @Param('engine', new ZodPipe(engineSchema)) engine: string,
    @Param('id', new ZodPipe(transcriptIdSchema)) id: string,
    @Param('toolUseId', new ZodPipe(subagentToolSchema)) toolUseId: string,
    @CurrentUser() userId: UserId,
  ): Promise<ToolResultDto> {
    return this.toolResult(this.conversation(engine, id), toolUseId, userId);
  }

  @Get(':engine/:id/images/:blockId')
  async readImage(
    @Param('engine', new ZodPipe(engineSchema)) engine: string,
    @Param('id', new ZodPipe(transcriptIdSchema)) id: string,
    @Param('blockId', new ZodPipe(blockIdSchema)) blockId: string,
    @CurrentUser() userId: UserId,
    @Res() response: Response,
  ): Promise<void> {
    await this.image(this.conversation(engine, id), blockId, userId, response);
  }

  private async page(
    sessionId: ConversationRef,
    query: ReadTranscriptQueryDto,
    userId: UserId,
  ): Promise<TranscriptPageDto> {
    const page = await this.reading.execute({
      userId,
      sessionId,
      before: query.cursor ?? null,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
    });

    return toTranscriptPageDto(page);
  }

  private async subagentPage(
    sessionId: ConversationRef,
    toolUseId: string,
    query: ReadTranscriptQueryDto,
    userId: UserId,
  ): Promise<SubagentPageDto> {
    const page = await this.reading.subagent({
      userId,
      sessionId,
      toolUseId,
      before: query.cursor ?? null,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
    });

    return toSubagentPageDto(page);
  }

  private async toolResult(
    sessionId: ConversationRef,
    toolUseId: string,
    userId: UserId,
  ): Promise<ToolResultDto> {
    return toToolResultDto(await this.results.execute({ userId, sessionId, toolUseId }));
  }

  /**
   * The bytes of an image of the conversation, never interpreted here: `nosniff` and a sandbox, so a
   * browser treats them as what the media type says and nothing else.
   */
  private async image(
    sessionId: ConversationRef,
    blockId: string,
    userId: UserId,
    response: Response,
  ): Promise<void> {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', 'sandbox');
    response.setHeader('Cache-Control', 'private, no-store');

    const image = await this.images.execute({ userId, sessionId, blockId });
    const bytes = Buffer.from(image.data, 'base64');

    response.status(200);
    response.setHeader('Content-Type', image.mediaType);
    response.setHeader('Content-Length', String(bytes.length));
    response.setHeader('Content-Disposition', 'inline');
    response.end(bytes);
  }
}
