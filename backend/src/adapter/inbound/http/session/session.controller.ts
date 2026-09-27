import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';

import { ListSessionCommandsUseCase, ListUndoPointsUseCase } from '@application/session';
import type { SessionCommandMenu, UndoPointPreview } from '@application/session';
import type { UserId } from '@domain/auth';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';

/**
 * Two questions about a live session, asked over HTTP — plan 04, F3 and F4.
 *
 * HTTP and not commands of the socket, for the reason the state of a permission request is: each is
 * a question with an answer, not a fact of the stream, and nobody else watching the session needs
 * to hear it ([05-websocket-protocol](../../../../../../docs/architecture/shared/05-websocket-protocol.md)).
 * Doing something — undoing — stays on the socket, where everybody watching is told.
 *
 * | Status | When |
 * |---|---|
 * | `200` | the answer |
 * | `400` | an id that is not a session's |
 * | `403` / `404` | a live session of somebody else / no live session with that id |
 * | `502` / `504` | the menu only: the CLI failed to list its commands, or did not in time |
 */
@Controller('sessions/:sessionId')
@UseGuards(BearerAuthGuard)
export class SessionController {
  constructor(
    @Inject(ListSessionCommandsUseCase) private readonly commands: ListSessionCommandsUseCase,
    @Inject(ListUndoPointsUseCase) private readonly undoPoints: ListUndoPointsUseCase,
  ) {}

  /**
   * The slash commands the session can run — the menu, asked of the installation. Internal and
   * dead entries are left out, and the suggested come first.
   */
  @Get('commands')
  listCommands(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: UserId,
  ): Promise<SessionCommandMenu> {
    return this.commands.execute(sessionId, userId);
  }

  /**
   * The points the session's files can go back to, newest first, each with what going back would
   * do to every file **now** — which go back, which stay and why. Confirmation without the list is
   * confirmation without information (B-19).
   */
  @Get('checkpoints')
  async listCheckpoints(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: UserId,
  ): Promise<{ readonly checkpoints: readonly UndoPointPreview[] }> {
    return { checkpoints: await this.undoPoints.execute(sessionId, userId) };
  }
}
