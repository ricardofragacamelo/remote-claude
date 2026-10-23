/** Where the MCP servers of an engine are kept in the query cache. */
export const mcpKeys = {
  all: (engine: string) => ['mcp', engine] as const,
  servers: (engine: string) => [...mcpKeys.all(engine), 'servers'] as const,
  projectServers: (engine: string, folder: string) =>
    [...mcpKeys.all(engine), 'project-servers', folder] as const,
};
