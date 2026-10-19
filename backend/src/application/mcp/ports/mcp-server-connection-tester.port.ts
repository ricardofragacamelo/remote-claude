import type { McpServerConfig, McpServerTestOutcome } from '@domain/mcp';

/**
 * Tests the connection of one server, engine-specific since actually running it is (plan 13,
 * B-25) — a throwaway probe, carrying only that one server, strict, torn down whatever it finds.
 */
export interface McpServerConnectionTester {
  /** @throws whatever the probe's own engine throws for a dead or unresponsive CLI, or no slot */
  test(config: McpServerConfig, timeoutMs: number): Promise<McpServerTestOutcome>;
}
