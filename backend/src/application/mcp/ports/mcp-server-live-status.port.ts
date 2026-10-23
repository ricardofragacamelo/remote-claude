import type { UserId } from '@domain/auth';
import type { McpStatus } from '@domain/session';

/**
 * Reading what a live session currently shows for a server of the store — closing the half of D-45
 * the B-22 text wanted and the store's own list left out until a screen actually read it (plan 13,
 * B-28): `GET /engines/:engine/mcp-servers` merges this status into every server it lists, rather
 * than a screen asking two routes and reconciling them itself.
 *
 * `application/mcp` never imports `application/session` directly (the same boundary {@link
 * import('./live-session-mcp-revocation.port').LiveSessionMcpRevocation} already crosses, in the
 * narrowing direction) — this port is the reading half, implemented by an adapter that reaches
 * `SessionRegistry` instead.
 */
export interface McpServerLiveStatusSource {
  /**
   * The live status of every server name a live session of [userId], on [engine], currently shows
   * — never throws: a session whose engine cannot answer right now is simply left out of the
   * merge, the same best-effort the narrowing sweep of {@link
   * import('./live-session-mcp-revocation.port').LiveSessionMcpRevocation} already applies. A name
   * with no entry has no live session showing it — `pending` or `disabled` is the store's own
   * call, never this port's.
   *
   * More than one live session can show the same name — a server of scope `user` reaches every
   * session, so this reports the one status among them that most needs attention: `failed` over
   * `needs-auth` over `pending` over `connected` (D-81) — a problem any open session has with a
   * server is worth surfacing even while another session still has it running cleanly.
   */
  statusFor(userId: UserId, engine: string): Promise<ReadonlyMap<string, McpStatus>>;
}

export const MCP_SERVER_LIVE_STATUS_SOURCE = Symbol('McpServerLiveStatusSource');
