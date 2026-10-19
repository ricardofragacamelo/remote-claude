/**
 * What an engine answered after a session was handed its composed set of servers (plan 13, B-21):
 * which names actually joined, which left, and which failed to connect — by name, never the
 * configuration or the error text the server itself produced (that can carry a token or a path; the
 * screen that shows a failure redacts it first, B-22's concern).
 */
export interface McpServerSetOutcome {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly errors: Readonly<Record<string, string>>;
}
