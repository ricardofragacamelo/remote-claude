// The public surface of the application of `mcp` (plan 13, B-19) — the store of servers, for every
// engine that carries the `mcp` capability. Other modules reach it through this barrel only.
export { McpEngineCapabilities } from './mcp-engine-capabilities';
export { McpEngineDialects } from './mcp-engine-dialects';
export { mergeSecretFields } from './merge-secret-fields';
export { ownedServer } from './owned-server';

export {
  CreateMcpServerUseCase,
  DeleteMcpServerUseCase,
  ListMcpServersUseCase,
  PreviewMcpServerUseCase,
  SetMcpServerEnabledUseCase,
  UpdateMcpServerUseCase,
} from './mcp-server.use-cases';
export type { McpServerDependencies } from './mcp-server.use-cases';

export { ComposeSessionMcpServersUseCase } from './compose-session-mcp-servers.use-case';
export type { ComposeSessionMcpServersQuery } from './compose-session-mcp-servers.use-case';

export type {
  McpSecretFieldInput,
  McpServerFieldsInput,
} from './commands/mcp-server-fields.command';

export {
  DuplicateMcpServerNameError,
  MCP_SERVER_REPOSITORY,
} from './ports/mcp-server-repository.port';
export type {
  McpSecretField,
  McpServerRepository,
  McpServerWrite,
  RevealedMcpServer,
  StoredMcpServer,
} from './ports/mcp-server-repository.port';

export { LIVE_SESSION_MCP_REVOCATION } from './ports/live-session-mcp-revocation.port';
export type { LiveSessionMcpRevocation } from './ports/live-session-mcp-revocation.port';
