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
   * An engine whose own tool-naming convention embeds a separator in the server and tool names
   * refuses a server name containing that separator — it would make the split ambiguous for the
   * adapter's own classifier, which is the one place that still speaks the engine's native names.
   */
  rejectsServerName(name: string): string | null;

  /**
   * Env var names this engine reserves for itself, on top of the ones every engine shares
   * (`LD_PRELOAD`, `NODE_OPTIONS`, …). An engine that reads its own configuration directory from an
   * env var reserves that name: a server that could set it would point the engine's whole
   * configuration somewhere the user never chose.
   */
  readonly reservedEnvNames: readonly string[];
}
