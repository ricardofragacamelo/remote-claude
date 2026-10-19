import type { McpEngineDialect } from '@domain/mcp';

/** An engine with no dialect of its own: the universal rules of B-18 are everything it adds. */
function noExtraRules(engine: string): McpEngineDialect {
  return { engine, rejectsServerName: () => null, reservedEnvNames: [] };
}

/**
 * The {@link McpEngineDialect} of each engine the installation drives (plan 13, B-18), by name —
 * the same per-engine-token-to-registry shape `RuleDialects` already uses for permission. Domain
 * validation asks this, never an engine's adapter directly, so `application/mcp` never imports an
 * extension.
 */
export class McpEngineDialects {
  private readonly byEngine: ReadonlyMap<string, McpEngineDialect>;

  constructor(dialects: readonly McpEngineDialect[]) {
    this.byEngine = new Map(dialects.map((dialect) => [dialect.engine, dialect]));
  }

  /** [engine]'s dialect, or one with no extra rule when the engine declared none. */
  for(engine: string): McpEngineDialect {
    return this.byEngine.get(engine) ?? noExtraRules(engine);
  }
}
