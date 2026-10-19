import type { McpServerTool } from '../entities/mcp-server-tool.entity';

/**
 * Where a test of the connection landed — `timeout` among them, data of the answer and not an
 * error, the same way the test of the model's connection treats `notLoggedIn`/`rateLimited` (plan
 * 13, D-08): the server not answering in time is an outcome of *it*, not of the engine dying, which
 * is still its own thrown error (`AGENT_UNAVAILABLE`/`AGENT_TIMEOUT`) from the probe itself.
 */
export type McpServerTestStatus = 'connected' | 'failed' | 'needs-auth' | 'timeout';

/** What testing one server's connection found (plan 13, B-25). */
export interface McpServerTestOutcome {
  readonly status: McpServerTestStatus;

  /** What the server offered — empty unless `status` is `connected`. */
  readonly tools: readonly McpServerTool[];

  /** Redacted, the same way B-22 already redacts a server's own error text; `null` unless `failed`. */
  readonly error: string | null;
}
