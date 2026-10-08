import { Controller, Get, Inject, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import {
  ListTranscriptsUseCase,
  ReadPromptImageUseCase,
  ReadToolResultUseCase,
  ReadTranscriptUseCase,
} from '@application/transcript';
import type { UserId } from '@domain/auth';
import { ClaudeSessionId } from '@domain/transcript';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import {
  blockIdSchema,
  DEFAULT_PAGE_SIZE,
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
 * | `502` / `504` | the Agent SDK failed, or did not answer in time (S-05, S-68) |
 */
@Controller('transcripts')
@UseGuards(BearerAuthGuard)
export class TranscriptController {
  constructor(
    @Inject(ListTranscriptsUseCase) private readonly listing: ListTranscriptsUseCase,
    @Inject(ReadTranscriptUseCase) private readonly reading: ReadTranscriptUseCase,
    @Inject(ReadToolResultUseCase) private readonly results: ReadToolResultUseCase,
    @Inject(ReadPromptImageUseCase) private readonly images: ReadPromptImageUseCase,
  ) {}

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
  @Get(':sessionId/messages')
  async read(
    @Param('sessionId', new ZodPipe(transcriptIdSchema)) sessionId: string,
    @Query(new ZodPipe(readTranscriptSchema)) query: ReadTranscriptQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<TranscriptPageDto> {
    const page = await this.reading.execute({
      userId,
      sessionId: ClaudeSessionId.create(sessionId),
      before: query.cursor ?? null,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
    });

    return toTranscriptPageDto(page);
  }

  /**
   * One page of what a subagent said, by the tool that opened it — from the latest message back
   * (plan 08, B-21). `404` for a subagent the conversation does not have, and for a conversation the
   * caller does not read, alike.
   */
  @Get(':sessionId/subagents/:toolUseId/messages')
  async readSubagent(
    @Param('sessionId', new ZodPipe(transcriptIdSchema)) sessionId: string,
    @Param('toolUseId', new ZodPipe(subagentToolSchema)) toolUseId: string,
    @Query(new ZodPipe(readTranscriptSchema)) query: ReadTranscriptQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<SubagentPageDto> {
    const page = await this.reading.subagent({
      userId,
      sessionId: ClaudeSessionId.create(sessionId),
      toolUseId,
      before: query.cursor ?? null,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
    });

    return toSubagentPageDto(page);
  }

  /**
   * The whole output of one tool of the main chain, when its card is unfolded (plan 22, B-11). Cut
   * above the ceiling, and said to be; `404` for a tool the chain has no result of.
   */
  @Get(':sessionId/tools/:toolUseId/result')
  async readToolResult(
    @Param('sessionId', new ZodPipe(transcriptIdSchema)) sessionId: string,
    @Param('toolUseId', new ZodPipe(subagentToolSchema)) toolUseId: string,
    @CurrentUser() userId: UserId,
  ): Promise<ToolResultDto> {
    const output = await this.results.execute({
      userId,
      sessionId: ClaudeSessionId.create(sessionId),
      toolUseId,
    });

    return toToolResultDto(output);
  }

  /**
   * The image a prompt carried, opened on demand (plan 22, B-12). The headers of D-10 go first, so a
   * refusal carries them too: whatever this route answers is never a document of the product's origin.
   */
  @Get(':sessionId/images/:blockId')
  async readImage(
    @Param('sessionId', new ZodPipe(transcriptIdSchema)) sessionId: string,
    @Param('blockId', new ZodPipe(blockIdSchema)) blockId: string,
    @CurrentUser() userId: UserId,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', 'sandbox');
    response.setHeader('Cache-Control', 'private, no-store');

    const image = await this.images.execute({
      userId,
      sessionId: ClaudeSessionId.create(sessionId),
      blockId,
    });
    const bytes = Buffer.from(image.data, 'base64');

    response.status(200);
    response.setHeader('Content-Type', image.mediaType);
    response.setHeader('Content-Length', String(bytes.length));
    response.setHeader('Content-Disposition', 'inline');
    response.end(bytes);
  }
}
