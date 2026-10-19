import type { UserId } from '@domain/auth';

/**
 * Reaching a live session when the store narrows what it may run (plan 13, B-23; D-10) — disabling
 * or removing a server turns it off in every session of [userId] already open on [engine], never
 * waiting for the next one. `application/mcp` never imports `application/session` directly; this
 * port is what crosses that boundary, the same way {@link
 * import('@application/session').SessionMcpServersSource} crosses it in the other direction (D-43).
 */
export interface LiveSessionMcpRevocation {
  /** Never throws: a session this reaches that lacks the server, the capability, or the engine, or
   * whose own engine cannot answer right now, is simply left as it is. */
  disableEverywhere(userId: UserId, engine: string, name: string): Promise<void>;
}

export const LIVE_SESSION_MCP_REVOCATION = Symbol('LiveSessionMcpRevocation');
