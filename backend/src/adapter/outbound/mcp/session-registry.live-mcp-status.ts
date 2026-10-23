import { Inject, Injectable } from '@nestjs/common';

import type { UserId } from '@domain/auth';
import type { McpStatus } from '@domain/session';
import type { McpServerLiveStatusSource } from '@application/mcp';
import { liveControl, liveSessionsWithCapability, SessionRegistry } from '@application/session';
import type { LiveSession } from '@application/session';

/** The most to the least urgent a name's live status can be — the first match wins a disagreement. */
const URGENCY: readonly McpStatus[] = ['failed', 'needs-auth', 'pending', 'connected', 'disabled'];

function moreUrgent(a: McpStatus, b: McpStatus): McpStatus {
  return URGENCY.indexOf(a) <= URGENCY.indexOf(b) ? a : b;
}

/**
 * Fulfils `application/mcp`'s port for reading live status, by asking every live session of this
 * installation the same way {@link
 * import('@application/session').DisableMcpServerEverywhereUseCase} already selects the sessions a
 * narrowing write reaches (plan 13, B-23) — this is the reading half, for the list (D-45, D-81).
 */
@Injectable()
export class SessionRegistryLiveMcpStatus implements McpServerLiveStatusSource {
  constructor(@Inject(SessionRegistry) private readonly registry: SessionRegistry) {}

  async statusFor(userId: UserId, engine: string): Promise<ReadonlyMap<string, McpStatus>> {
    const affected = liveSessionsWithCapability(this.registry, userId, engine, 'mcp');
    const lists = await Promise.all(affected.map((live) => this.serversOf(live)));
    const byName = new Map<string, McpStatus>();

    for (const servers of lists) {
      for (const server of servers) {
        const current = byName.get(server.name);
        byName.set(
          server.name,
          current === undefined ? server.status : moreUrgent(current, server.status),
        );
      }
    }

    return byName;
  }

  private async serversOf(
    live: LiveSession,
  ): Promise<readonly { name: string; status: McpStatus }[]> {
    try {
      return await liveControl(live, 'mcpServers')();
    } catch {
      // Already logged by the engine's own adapter (`askControl`) — one session's engine trouble
      // never stops the merge from reading the others, the same reasoning
      // `DisableMcpServerEverywhereUseCase` already applies to the narrowing sweep.
      return [];
    }
  }
}
