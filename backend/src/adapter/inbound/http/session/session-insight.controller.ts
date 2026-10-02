import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';

import { InspectSessionUseCase } from '@application/session';
import type { SessionModels } from '@application/session';
import type { UserId } from '@domain/auth';
import type { ContextUse, McpServer } from '@domain/session';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';

/**
 * What the panel shows about a live session without asking the model anything — plan 08, F4: the
 * models of its installation, the use of its context window, its MCP servers.
 *
 * Reads, so HTTP. Each is a control request of the session's own query, logged by the adapter that
 * makes it, with how long it took.
 *
 * | Status | When |
 * |---|---|
 * | `200` | the answer |
 * | `400` | an id that is not a session's |
 * | `403` / `404` | a live session of somebody else / no live session with that id |
 * | `502` / `504` | the CLI failed to answer, or did not in time — the panel goes on without it |
 */
@Controller('sessions/:sessionId')
@UseGuards(BearerAuthGuard)
export class SessionInsightController {
  constructor(@Inject(InspectSessionUseCase) private readonly inspect: InspectSessionUseCase) {}

  /** The installation's models, and the one the session runs (B-36) — never a list of ours. */
  @Get('models')
  models(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: UserId,
  ): Promise<SessionModels> {
    return this.inspect.modelsOf(sessionId, userId);
  }

  /** The use of the context window by category, against the window of the model (B-37). */
  @Get('context')
  context(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: UserId,
  ): Promise<ContextUse> {
    return this.inspect.contextOf(sessionId, userId);
  }

  /** The MCP servers of the session — name, status and tool count, never their configuration (B-38). */
  @Get('mcp-servers')
  async mcpServers(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: UserId,
  ): Promise<{ readonly servers: readonly McpServer[] }> {
    return { servers: await this.inspect.mcpServersOf(sessionId, userId) };
  }
}
