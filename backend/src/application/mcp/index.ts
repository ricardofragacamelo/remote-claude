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
export type {
  McpServerDependencies,
  McpServerPreviewResult,
  McpServerView,
} from './mcp-server.use-cases';

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

export type { McpServerRuleRevocation } from './ports/mcp-server-rule-revocation.port';

export { MCP_SERVER_LIVE_STATUS_SOURCE } from './ports/mcp-server-live-status.port';
export type { McpServerLiveStatusSource } from './ports/mcp-server-live-status.port';

export type {
  ProjectMcpClimbRequest,
  ProjectMcpFileError,
  ProjectMcpFileRead,
  ProjectMcpServersSource,
} from './ports/project-mcp-servers.source';

export { ProjectMcpServersSources } from './project-mcp-servers-sources';
export type { EngineProjectMcpServersSource } from './project-mcp-servers-sources';

export { MCP_PROJECT_APPROVAL_REPOSITORY } from './ports/mcp-project-approval-repository.port';
export type {
  McpProjectApprovalRepository,
  McpProjectApprovalWrite,
  StoredMcpProjectApproval,
} from './ports/mcp-project-approval-repository.port';

export {
  ApproveProjectMcpServerUseCase,
  ListProjectMcpServersUseCase,
  RejectProjectMcpServerUseCase,
} from './project-mcp-approval.use-cases';
export type {
  McpProjectApprovalDependencies,
  ProjectMcpFileIssue,
  ProjectMcpListResult,
  ProjectMcpServerView,
} from './project-mcp-approval.use-cases';

export type { McpServerConnectionTester } from './ports/mcp-server-connection-tester.port';
export { McpServerConnectionTesters } from './mcp-server-connection-testers';
export type { EngineMcpServerConnectionTester } from './mcp-server-connection-testers';
export {
  MCP_SERVER_TEST_TIMEOUT,
  MCP_SERVER_TEST_TIMEOUT_MS,
  TestMcpServerConnectionUseCase,
} from './test-mcp-server-connection.use-case';
export type { TestMcpServerConnectionDependencies } from './test-mcp-server-connection.use-case';
