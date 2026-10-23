import type { UserId } from '@domain/auth';

/**
 * Reaches `permission` to take back every `allow` rule of a user that answers for a server whose
 * program changed, or that is gone (plan 13, B-26; D-12) — declared here, in `application/mcp`,
 * and implemented by an adapter that wraps `application/permission`'s own use case, the same
 * port/adapter shape {@link import('./live-session-mcp-revocation.port').LiveSessionMcpRevocation}
 * already has for reaching a live session (B-23): `application/mcp` never imports
 * `application/permission` directly.
 */
export interface McpServerRuleRevocation {
  execute(userId: UserId, engine: string, serverName: string): Promise<unknown>;

  /**
   * The content of every `allow` rule {@link execute} would revoke right now, were it called —
   * never mutates anything (plan 13, B-28, D-62, D-79). What the edit preview's second step lists
   * before a save that changes the server's program.
   */
  preview(userId: UserId, engine: string, serverName: string): Promise<readonly string[]>;
}
