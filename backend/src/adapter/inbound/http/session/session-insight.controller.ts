import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import type { AgentModel, ContextUsePayload } from '@remote-claude/contracts';

import { InspectSessionUseCase } from '@application/session';
import type { SessionModels } from '@application/session';
import type { UserId } from '@domain/auth';
import type { ContextUse, McpServer } from '@domain/session';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { toModelDto } from './model.dto';

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
/**
 * The use of the context window as the contract carries it (plan 28, B-24): a canonical category by
 * its key, any other by the engine's words. The percentage is whole: the screens draw a whole number.
 */
export function toContextUseDto(use: ContextUse): ContextUsePayload {
  return {
    model: use.model,
    totalTokens: use.totalTokens,
    maxTokens: use.maxTokens,
    percentage: Math.round(use.percentage),
    categories: use.categories.map((category) => ({
      id: category.id,
      ...(category.messageKey === null
        ? { text: category.name }
        : { messageKey: category.messageKey }),
      tokens: category.tokens,
      kind: category.kind,
    })),
  };
}

@Controller('sessions/:sessionId')
@UseGuards(BearerAuthGuard)
export class SessionInsightController {
  constructor(@Inject(InspectSessionUseCase) private readonly inspect: InspectSessionUseCase) {}

  /** The installation's models, and the one the session runs (B-36) — never a list of ours. */
  @Get('models')
  async models(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: UserId,
  ): Promise<Omit<SessionModels, 'models'> & { readonly models: readonly AgentModel[] }> {
    const { current, models } = await this.inspect.modelsOf(sessionId, userId);
    return { current, models: models.map(toModelDto) };
  }

  /** The use of the context window by category, against the window of the model (B-37). */
  @Get('context')
  async context(
    @Param('sessionId') sessionId: string,
    @CurrentUser() userId: UserId,
  ): Promise<ContextUsePayload> {
    return toContextUseDto(await this.inspect.contextOf(sessionId, userId));
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
