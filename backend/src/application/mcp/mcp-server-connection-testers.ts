import type { McpServerConnectionTester } from './ports/mcp-server-connection-tester.port';

/** One engine's tester, and the name it answers for. */
export interface EngineMcpServerConnectionTester {
  readonly engine: string;
  readonly tester: McpServerConnectionTester;
}

/**
 * The {@link McpServerConnectionTester} of each engine the installation drives (plan 13, B-25), by
 * name — the same per-engine-token-to-registry shape {@link import('./mcp-engine-dialects').McpEngineDialects}
 * and {@link import('./project-mcp-servers-sources').ProjectMcpServersSources} already use.
 */
export class McpServerConnectionTesters {
  private readonly byEngine: ReadonlyMap<string, McpServerConnectionTester>;

  constructor(testers: readonly EngineMcpServerConnectionTester[]) {
    this.byEngine = new Map(testers.map(({ engine, tester }) => [engine, tester]));
  }

  /** [engine]'s tester, or `null` when this installation drives no tester for it. */
  for(engine: string): McpServerConnectionTester | null {
    return this.byEngine.get(engine) ?? null;
  }
}
