import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import {
  ListSessionChangesUseCase,
  ReadSessionChangeUseCase,
  ShowToolDiffUseCase,
} from '@application/session';
import type { SessionChangeFile, SessionChanges } from '@application/session';
import type { UserId } from '@domain/auth';
import type { ToolDiff } from '@domain/session';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';

const changeFileQuery = z.object({
  path: z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => value.startsWith('/'), { message: 'path must be absolute' }),
});

type ChangeFileQuery = z.infer<typeof changeFileQuery>;

/** How long a side is, for the log: its size, never its text. */
function lengthOf(side: { readonly state: string; readonly content?: string }): number | null {
  return side.content === undefined ? null : side.content.length;
}

/**
 * What a live session changed on disk, asked over HTTP — plan 08, F3.
 *
 * Reads, so HTTP: a diff is a question with an answer, not a fact everybody watching must hear
 * (docs/architecture/shared/05-websocket-protocol.md). Rejecting stays on the socket, where
 * everybody watching is told.
 *
 * The log carries the path and the sizes of each side — **never** their contents: a file of
 * somebody's repository is no log line (S-112).
 *
 * | Status | When |
 * |---|---|
 * | `200` | the answer |
 * | `400` | an id that is not a session's, or a relative path |
 * | `403` | a live session of somebody else (`FORBIDDEN`); a path that became a link (`WORKSPACE_NOT_ALLOWED`) |
 * | `404` | no live session with that id; a tool use it does not have (`TOOL_USE_NOT_FOUND`); a path it did not change (`NOT_FOUND`) |
 * | `415` | a side that is not text (`FILE_NOT_TEXT`) |
 * | `422` | a tool that writes no file (`DIFF_NOT_APPLICABLE`) |
 */
@Controller('sessions/:sessionId')
@UseGuards(BearerAuthGuard)
export class SessionChangesController {
  constructor(
    @Inject(ShowToolDiffUseCase) private readonly toolDiff: ShowToolDiffUseCase,
    @Inject(ListSessionChangesUseCase) private readonly changes: ListSessionChangesUseCase,
    @Inject(ReadSessionChangeUseCase) private readonly change: ReadSessionChangeUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Before and after of one `Edit`, `MultiEdit` or `Write` (B-25). */
  @Get('tools/:toolUseId/diff')
  async diffOfTool(
    @Param('sessionId') sessionId: string,
    @Param('toolUseId') toolUseId: string,
    @CurrentUser() userId: UserId,
  ): Promise<ToolDiff> {
    const diff = await this.toolDiff.execute(sessionId, toolUseId, userId);

    this.logger.debug(
      {
        op: 'session.diff',
        layer: 'adapter',
        sessionId,
        toolUseId,
        path: diff.path,
        scope: diff.scope,
        before: diff.before.state,
        beforeLength: lengthOf(diff.before),
        afterLength: lengthOf(diff.after),
        hunks: diff.hunks.length,
      },
      'the diff of a tool read',
    );

    return diff;
  }

  /** Every file the session changed, against before the session (B-26). */
  @Get('changes')
  async listChanges(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: UserId,
  ): Promise<SessionChanges> {
    const changes = await this.changes.execute(sessionId, userId);

    this.logger.debug(
      { op: 'session.changes', layer: 'adapter', sessionId, count: changes.files.length },
      'the changes of a session listed',
    );

    return changes;
  }

  /** One of those files, whole: before, now, the hunks and the revision they were computed on. */
  @Get('changes/file')
  async readChange(
    @Param('sessionId') sessionId: string,
    @Query(new ZodPipe(changeFileQuery)) query: ChangeFileQuery,
    @CurrentUser() userId: UserId,
  ): Promise<SessionChangeFile> {
    const file = await this.change.execute(sessionId, query.path, userId);

    this.logger.debug(
      {
        op: 'session.changes',
        layer: 'adapter',
        sessionId,
        path: file.path,
        kind: file.kind,
        beforeLength: lengthOf(file.before),
        nowLength: lengthOf(file.now),
        hunks: file.hunks.length,
      },
      'a file of the changes of a session read',
    );

    return file;
  }
}
