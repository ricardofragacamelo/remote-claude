// The public surface of the domain of `mcp` (plan 28, B-36, D-06): the servers of the Model Context
// Protocol a session of any engine is given — an open protocol, so a capability of the core (`mcp`),
// kept by engine. Other modules reach it through this barrel only.
export { McpApprovalStaleError } from './errors/mcp-approval-stale.error';
export { McpEngineNotSupportedError } from './errors/mcp-engine-not-supported.error';
export { McpServerConfigInvalidError } from './errors/mcp-server-config-invalid.error';
export { McpServerForbiddenError } from './errors/mcp-server-forbidden.error';
export { McpServerNameTakenError } from './errors/mcp-server-name-taken.error';
export { McpServerNotFoundError } from './errors/mcp-server-not-found.error';
export { SecretStoreUnavailableError } from './errors/secret-store-unavailable.error';

export type { McpEngineDialect } from './ports/mcp-engine-dialect.port';

export {
  MCP_SCOPES,
  MCP_TRANSPORTS,
  MCP_SERVER_NAME_PATTERN,
  MCP_LIMITS,
  createMcpServerConfig,
} from './entities/mcp-server-config.entity';
export type {
  McpServerScope,
  McpTransport,
  McpEnvVar,
  McpHeader,
  McpServerIdentity,
  McpServerInput,
  McpServerConfig,
} from './entities/mcp-server-config.entity';

export { describeMcpServer } from './services/mcp-server-description';
export type { McpServerDescription } from './services/mcp-server-description';

export type { McpServerSetOutcome } from './services/mcp-server-set-outcome';

export { digestOfProjectMcpEntry } from './entities/project-mcp-entry.entity';
export type { ProjectMcpEntry } from './entities/project-mcp-entry.entity';

export {
  PROJECT_MCP_APPROVAL_STATES,
  projectMcpApprovalStateOf,
} from './services/project-mcp-approval-state';
export type {
  ProjectMcpApprovalState,
  ProjectMcpDecision,
} from './services/project-mcp-approval-state';

export type { McpServerTool, McpServerToolAnnotations } from './entities/mcp-server-tool.entity';
export type { McpServerTestOutcome, McpServerTestStatus } from './services/mcp-server-test-outcome';
