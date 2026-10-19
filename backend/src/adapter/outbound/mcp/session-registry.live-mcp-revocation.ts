import { Inject, Injectable } from '@nestjs/common';

import type { UserId } from '@domain/auth';
import type { LiveSessionMcpRevocation } from '@application/mcp';
import { DisableMcpServerEverywhereUseCase } from '@application/session';

/**
 * Fulfils `application/mcp`'s port for reaching a live session, by forwarding to
 * `DisableMcpServerEverywhereUseCase` (plan 13, B-23) — the same shape {@link
 * import('@adapter/outbound/session/mcp-module.session-mcp-servers').McpModuleSessionMcpServers}
 * has for B-21's port, in the other direction.
 */
@Injectable()
export class SessionRegistryLiveMcpRevocation implements LiveSessionMcpRevocation {
  constructor(
    @Inject(DisableMcpServerEverywhereUseCase)
    private readonly disable: DisableMcpServerEverywhereUseCase,
  ) {}

  disableEverywhere(userId: UserId, engine: string, name: string): Promise<void> {
    return this.disable.execute(userId, engine, name);
  }
}
