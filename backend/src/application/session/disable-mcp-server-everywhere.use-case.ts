import type { UserId } from '@domain/auth';
import { liveControl, liveSessionsWithCapability } from './session-registry';
import type { LiveSession, SessionRegistry } from './session-registry';
import type { SessionBroadcaster } from './ports/session-broadcaster.port';

/**
 * Turns one MCP server off in every live session of [userId], on [engine], that currently has it
 * (plan 13, B-23; D-10): the narrowing half of the asymmetry the store's own write already has
 * (D-34) — removing or disabling a server takes effect in whatever is already running, immediately,
 * never waiting for the next session. Widening (adding, enabling) has no equivalent: a session
 * already open never gains a server it did not start with, by design (D-10).
 *
 * A session without the server, without the `mcp` capability, or on another engine, is left alone.
 * A session whose engine cannot answer right now — a dead subprocess, say — is skipped rather than
 * failing the whole sweep: the others still get told, and the engine's own adapter already logs the
 * one that could not (the same reasoning `StartSessionUseCase`'s own best-effort publish already
 * follows, D-44).
 */
export class DisableMcpServerEverywhereUseCase {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly broadcaster: SessionBroadcaster,
  ) {}

  async execute(userId: UserId, engine: string, name: string): Promise<void> {
    const affected = liveSessionsWithCapability(this.registry, userId, engine, 'mcp');

    await Promise.all(affected.map((live) => this.disableIn(live, name)));
  }

  private async disableIn(live: LiveSession, name: string): Promise<void> {
    try {
      const before = await liveControl(live, 'mcpServers')();
      if (!before.some((server) => server.name === name)) {
        return;
      }

      await liveControl(live, 'toggleMcpServer')(name, false);
      const servers = await liveControl(live, 'mcpServers')();
      this.broadcaster.publish(live.session.id, {
        type: 'session.mcpStatusChanged',
        payload: { servers },
      });
    } catch {
      // Already logged by the engine's own adapter (`askControl`) — one session's engine trouble
      // never stops the sweep from reaching the others.
    }
  }
}
