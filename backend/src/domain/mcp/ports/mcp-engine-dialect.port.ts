/**
 * What only the engine knows about its own MCP surface (plan 13, B-18): the domain of `mcp` stays
 * neutral — no engine name, no native grammar — and asks this port for the one or two things that
 * genuinely vary per engine. A pure value, read off the engine's adapter the way `commandMenu` and
 * `security` already are ({@link import('@application/session').AgentEnginePort}); nothing here does
 * I/O.
 */
export interface McpEngineDialect {
  /** Which engine this is — the same name {@link import('@domain/engine').EngineId} carries. */
  readonly engine: string;

  /**
   * Why this engine refuses [name] as a server name, or `null` when the engine has no objection —
   * the universal pattern (`^[A-Za-z0-9_-]{1,64}$`) is checked before this is ever asked.
   *
   * The Claude dialect refuses `__`: the tool a server exposes arrives as `mcp__<server>__<tool>`,
   * and a server name with `__` makes the split ambiguous for the adapter's own classifier.
   */
  rejectsServerName(name: string): string | null;

  /**
   * Env var names this engine reserves for itself, on top of the ones every engine shares
   * (`LD_PRELOAD`, `NODE_OPTIONS`, …). The Claude dialect reserves `CLAUDE_CONFIG_DIR`: a server
   * that could set it would point the CLI's own configuration somewhere the user never chose.
   */
  readonly reservedEnvNames: readonly string[];
}
