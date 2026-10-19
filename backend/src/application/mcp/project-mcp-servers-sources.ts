import type { ProjectMcpServersSource } from './ports/project-mcp-servers.source';

/** One engine's reader, and the name it answers for. */
export interface EngineProjectMcpServersSource {
  readonly engine: string;
  readonly source: ProjectMcpServersSource;
}

/**
 * The {@link ProjectMcpServersSource} of each engine the installation drives (plan 13, B-24), by
 * name — the same per-engine-token-to-registry shape {@link import('./mcp-engine-dialects').McpEngineDialects}
 * already uses. `application/mcp` asks this, never an engine's adapter directly.
 */
export class ProjectMcpServersSources {
  private readonly byEngine: ReadonlyMap<string, ProjectMcpServersSource>;

  constructor(sources: readonly EngineProjectMcpServersSource[]) {
    this.byEngine = new Map(sources.map(({ engine, source }) => [engine, source]));
  }

  /** [engine]'s reader, or `null` when this installation drives no reader for it. */
  for(engine: string): ProjectMcpServersSource | null {
    return this.byEngine.get(engine) ?? null;
  }
}
