import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';

import { ListTranscriptsUseCase, ReadTranscriptUseCase } from '@application/transcript';
import type { UserId } from '@domain/auth';
import { ClaudeSessionId } from '@domain/transcript';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import {
  DEFAULT_PAGE_SIZE,
  listTranscriptsSchema,
  readTranscriptSchema,
  toSessionListCursor,
  toTranscriptListDto,
  toTranscriptPageDto,
  transcriptIdSchema,
} from './transcript.dto';
import type {
  ListTranscriptsQueryDto,
  ReadTranscriptQueryDto,
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
 * | `502` / `504` | the Agent SDK failed, or did not answer in time (S-05, S-68) |
 */
@Controller('transcripts')
@UseGuards(BearerAuthGuard)
export class TranscriptController {
  constructor(
    @Inject(ListTranscriptsUseCase) private readonly listing: ListTranscriptsUseCase,
    @Inject(ReadTranscriptUseCase) private readonly reading: ReadTranscriptUseCase,
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
}
