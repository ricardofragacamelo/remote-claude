import { McpEngineNotSupportedError } from '@domain/mcp';

/**
 * Which enabled engines carry the `mcp` capability (plan 13, B-19; plan 28, F1) — built once at
 * composition from the engines the installation drives, never asked of `EngineRegistry` directly:
 * the application of `mcp` stays decoupled from `session`'s, the way `agent-settings`'s own registry
 * already is.
 */
export class McpEngineCapabilities {
  private readonly engines: ReadonlySet<string>;

  constructor(engines: readonly string[]) {
    this.engines = new Set(engines);
  }

  /** @throws {McpEngineNotSupportedError} not enabled, or enabled without the `mcp` capability */
  assertSupports(engine: string): void {
    if (!this.engines.has(engine)) {
      throw new McpEngineNotSupportedError(engine);
    }
  }

  /** Every engine this installation drives that has the capability, in registration order. */
  get supported(): readonly string[] {
    return [...this.engines];
  }
}
