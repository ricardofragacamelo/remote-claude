import { Module } from '@nestjs/common';

import { McpServersController } from '@adapter/inbound/http/engines/mcp-servers.controller';
import { ProjectMcpApprovalsController } from '@adapter/inbound/http/engines/project-mcp-approvals.controller';
import { DrizzleMcpServerRepository } from '@adapter/outbound/persistence/mcp/mcp-server.repository';
import { MCP_SECRET_KEY_FILE } from '@adapter/outbound/persistence/mcp/mcp-server.repository';
import { DrizzleMcpProjectApprovalRepository } from '@adapter/outbound/persistence/mcp/drizzle-mcp-project-approval.repository';
import { SessionRegistryLiveMcpRevocation } from '@adapter/outbound/mcp/session-registry.live-mcp-revocation';
import { SessionRegistryLiveMcpStatus } from '@adapter/outbound/mcp/session-registry.live-mcp-status';
import {
  ApproveProjectMcpServerUseCase,
  ComposeSessionMcpServersUseCase,
  CreateMcpServerUseCase,
  DeleteMcpServerUseCase,
  LIVE_SESSION_MCP_REVOCATION,
  ListMcpServersUseCase,
  ListProjectMcpServersUseCase,
  MCP_PROJECT_APPROVAL_REPOSITORY,
  MCP_SERVER_LIVE_STATUS_SOURCE,
  MCP_SERVER_REPOSITORY,
  MCP_SERVER_TEST_TIMEOUT,
  MCP_SERVER_TEST_TIMEOUT_MS,
  McpEngineCapabilities,
  McpEngineDialects,
  McpServerConnectionTesters,
  PreviewMcpServerUseCase,
  ProjectMcpServersSources,
  RejectProjectMcpServerUseCase,
  SetMcpServerEnabledUseCase,
  TestMcpServerConnectionUseCase,
  UpdateMcpServerUseCase,
} from '@application/mcp';
import type {
  LiveSessionMcpRevocation,
  McpProjectApprovalDependencies,
  McpProjectApprovalRepository,
  McpServerDependencies,
  McpServerLiveStatusSource,
  McpServerRepository,
  McpServerRuleRevocation,
} from '@application/mcp';
import { FOLDER_ACCESS } from '@application/agent-settings';
import type { FolderAccess } from '@application/agent-settings';
import { RevokeMcpServerRulesUseCase } from '@application/permission';
import {
  DisableMcpServerEverywhereUseCase,
  SESSION_BROADCASTER,
  SessionRegistry,
} from '@application/session';
import type { SessionBroadcaster } from '@application/session';
import { RecordAuditEventUseCase } from '@application/audit';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { EngineProbeModule, engineMcpProviders } from './engines';
import { AgentSettingsModule } from './agent-settings.module';
import { AuditModule } from './audit.module';
import { AuthModule } from './auth.module';
import { PermissionModule } from './permission.module';
import { SessionRegistryModule } from './session-registry.module';

/** What every MCP server use case is built with. */
const MCP_SERVER_DEPENDENCIES = Symbol('McpServerDependencies');

/** What every project MCP approval use case is built with (plan 13, B-24). */
const MCP_PROJECT_APPROVAL_DEPENDENCIES = Symbol('McpProjectApprovalDependencies');

/**
 * The `mcp` module: the store of MCP servers, a capability of the core kept by engine (plan 13,
 * B-19; plan 28, B-36). It owns no live session and names no engine — the dialect of each is read
 * through {@link McpEngineDialects}, built by {@link engineMcpProviders} from whichever engines the
 * composition enables, never imported here by name.
 *
 * Disabling or removing a server reaches a live session too (plan 13, B-23), through
 * {@link LiveSessionMcpRevocation} — never `application/session` directly, which already imports
 * this module for B-21 (`ComposeSessionMcpServersUseCase`) and would cycle back. `SessionRegistry`
 * and the broadcaster come from `SessionRegistryModule`, a leaf of `session`'s own for exactly this
 * (docs/architecture/backend/03-modules.md#fronteiras).
 *
 * See docs/architecture/backend/03-modules.md#mcp.
 */
@Module({
  imports: [
    AgentSettingsModule,
    AuditModule,
    AuthModule,
    EngineProbeModule,
    PermissionModule,
    SessionRegistryModule,
  ],
  controllers: [McpServersController, ProjectMcpApprovalsController],
  providers: [
    ...engineMcpProviders,
    { provide: MCP_SERVER_REPOSITORY, useClass: DrizzleMcpServerRepository },
    { provide: MCP_PROJECT_APPROVAL_REPOSITORY, useClass: DrizzleMcpProjectApprovalRepository },
    {
      provide: MCP_SECRET_KEY_FILE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => config.mcp.secretKeyFile,
    },
    {
      provide: DisableMcpServerEverywhereUseCase,
      inject: [SessionRegistry, SESSION_BROADCASTER],
      useFactory: (registry: SessionRegistry, broadcaster: SessionBroadcaster) =>
        new DisableMcpServerEverywhereUseCase(registry, broadcaster),
    },
    { provide: LIVE_SESSION_MCP_REVOCATION, useClass: SessionRegistryLiveMcpRevocation },
    { provide: MCP_SERVER_LIVE_STATUS_SOURCE, useClass: SessionRegistryLiveMcpStatus },
    {
      provide: MCP_SERVER_DEPENDENCIES,
      inject: [
        MCP_SERVER_REPOSITORY,
        McpEngineCapabilities,
        McpEngineDialects,
        RecordAuditEventUseCase,
        ID_GENERATOR,
        CLOCK,
        LIVE_SESSION_MCP_REVOCATION,
        RevokeMcpServerRulesUseCase,
        MCP_SERVER_LIVE_STATUS_SOURCE,
      ],
      useFactory: (
        servers: McpServerRepository,
        capabilities: McpEngineCapabilities,
        dialects: McpEngineDialects,
        trail: RecordAuditEventUseCase,
        ids: IdGenerator,
        clock: Clock,
        liveSessions: LiveSessionMcpRevocation,
        ruleRevocation: McpServerRuleRevocation,
        liveStatus: McpServerLiveStatusSource,
      ): McpServerDependencies => ({
        servers,
        capabilities,
        dialects,
        trail,
        ids,
        clock,
        liveSessions,
        ruleRevocation,
        liveStatus,
      }),
    },
    {
      provide: ListMcpServersUseCase,
      inject: [MCP_SERVER_DEPENDENCIES],
      useFactory: (deps: McpServerDependencies) => new ListMcpServersUseCase(deps),
    },
    {
      provide: PreviewMcpServerUseCase,
      inject: [MCP_SERVER_DEPENDENCIES],
      useFactory: (deps: McpServerDependencies) => new PreviewMcpServerUseCase(deps),
    },
    {
      provide: CreateMcpServerUseCase,
      inject: [MCP_SERVER_DEPENDENCIES],
      useFactory: (deps: McpServerDependencies) => new CreateMcpServerUseCase(deps),
    },
    {
      provide: UpdateMcpServerUseCase,
      inject: [MCP_SERVER_DEPENDENCIES],
      useFactory: (deps: McpServerDependencies) => new UpdateMcpServerUseCase(deps),
    },
    {
      provide: SetMcpServerEnabledUseCase,
      inject: [MCP_SERVER_DEPENDENCIES],
      useFactory: (deps: McpServerDependencies) => new SetMcpServerEnabledUseCase(deps),
    },
    {
      provide: DeleteMcpServerUseCase,
      inject: [MCP_SERVER_DEPENDENCIES],
      useFactory: (deps: McpServerDependencies) => new DeleteMcpServerUseCase(deps),
    },
    {
      provide: ComposeSessionMcpServersUseCase,
      inject: [
        MCP_SERVER_REPOSITORY,
        McpEngineCapabilities,
        ProjectMcpServersSources,
        MCP_PROJECT_APPROVAL_REPOSITORY,
      ],
      useFactory: (
        servers: McpServerRepository,
        capabilities: McpEngineCapabilities,
        projectSources: ProjectMcpServersSources,
        approvals: McpProjectApprovalRepository,
      ) => new ComposeSessionMcpServersUseCase(servers, capabilities, projectSources, approvals),
    },
    {
      provide: MCP_PROJECT_APPROVAL_DEPENDENCIES,
      inject: [
        McpEngineCapabilities,
        FOLDER_ACCESS,
        ProjectMcpServersSources,
        MCP_PROJECT_APPROVAL_REPOSITORY,
        RecordAuditEventUseCase,
        CLOCK,
      ],
      useFactory: (
        capabilities: McpEngineCapabilities,
        folders: FolderAccess,
        sources: ProjectMcpServersSources,
        approvals: McpProjectApprovalRepository,
        trail: RecordAuditEventUseCase,
        clock: Clock,
      ): McpProjectApprovalDependencies => ({
        capabilities,
        folders,
        sources,
        approvals,
        trail,
        clock,
      }),
    },
    {
      provide: ListProjectMcpServersUseCase,
      inject: [MCP_PROJECT_APPROVAL_DEPENDENCIES],
      useFactory: (deps: McpProjectApprovalDependencies) => new ListProjectMcpServersUseCase(deps),
    },
    {
      provide: ApproveProjectMcpServerUseCase,
      inject: [MCP_PROJECT_APPROVAL_DEPENDENCIES],
      useFactory: (deps: McpProjectApprovalDependencies) =>
        new ApproveProjectMcpServerUseCase(deps),
    },
    {
      provide: RejectProjectMcpServerUseCase,
      inject: [MCP_PROJECT_APPROVAL_DEPENDENCIES],
      useFactory: (deps: McpProjectApprovalDependencies) => new RejectProjectMcpServerUseCase(deps),
    },
    { provide: MCP_SERVER_TEST_TIMEOUT, useValue: MCP_SERVER_TEST_TIMEOUT_MS },
    {
      provide: TestMcpServerConnectionUseCase,
      inject: [
        MCP_SERVER_REPOSITORY,
        McpEngineCapabilities,
        McpServerConnectionTesters,
        RecordAuditEventUseCase,
        CLOCK,
        MCP_SERVER_TEST_TIMEOUT,
      ],
      useFactory: (
        servers: McpServerRepository,
        capabilities: McpEngineCapabilities,
        testers: McpServerConnectionTesters,
        trail: RecordAuditEventUseCase,
        clock: Clock,
        timeoutMs: number,
      ) =>
        new TestMcpServerConnectionUseCase({
          servers,
          capabilities,
          testers,
          trail,
          clock,
          timeoutMs,
        }),
    },
  ],
  exports: [
    MCP_SERVER_REPOSITORY,
    McpEngineCapabilities,
    McpEngineDialects,
    ListMcpServersUseCase,
    PreviewMcpServerUseCase,
    CreateMcpServerUseCase,
    UpdateMcpServerUseCase,
    SetMcpServerEnabledUseCase,
    DeleteMcpServerUseCase,
    ComposeSessionMcpServersUseCase,
    ListProjectMcpServersUseCase,
    ApproveProjectMcpServerUseCase,
    RejectProjectMcpServerUseCase,
    TestMcpServerConnectionUseCase,
  ],
})
export class McpModule {}
