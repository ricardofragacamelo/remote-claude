import { Module } from '@nestjs/common';

import { McpServersController } from '@adapter/inbound/http/engines/mcp-servers.controller';
import { DrizzleMcpServerRepository } from '@adapter/outbound/persistence/mcp/mcp-server.repository';
import { MCP_SECRET_KEY_FILE } from '@adapter/outbound/persistence/mcp/mcp-server.repository';
import {
  CreateMcpServerUseCase,
  DeleteMcpServerUseCase,
  ListMcpServersUseCase,
  MCP_SERVER_REPOSITORY,
  McpEngineCapabilities,
  McpEngineDialects,
  PreviewMcpServerUseCase,
  SetMcpServerEnabledUseCase,
  UpdateMcpServerUseCase,
} from '@application/mcp';
import type { McpServerDependencies, McpServerRepository } from '@application/mcp';
import { RecordAuditEventUseCase } from '@application/audit';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { engineMcpProviders } from './engines';
import { AuditModule } from './audit.module';
import { AuthModule } from './auth.module';

/** What every MCP server use case is built with. */
const MCP_SERVER_DEPENDENCIES = Symbol('McpServerDependencies');

/**
 * The `mcp` module: the store of MCP servers, a capability of the core kept by engine (plan 13,
 * B-19; plan 28, B-36). It owns no live session and names no engine — the dialect of each is read
 * through {@link McpEngineDialects}, built by {@link engineMcpProviders} from whichever engines the
 * composition enables, never imported here by name.
 *
 * See docs/architecture/backend/03-modules.md#mcp.
 */
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [McpServersController],
  providers: [
    ...engineMcpProviders,
    { provide: MCP_SERVER_REPOSITORY, useClass: DrizzleMcpServerRepository },
    {
      provide: MCP_SECRET_KEY_FILE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => config.mcp.secretKeyFile,
    },
    {
      provide: MCP_SERVER_DEPENDENCIES,
      inject: [
        MCP_SERVER_REPOSITORY,
        McpEngineCapabilities,
        McpEngineDialects,
        RecordAuditEventUseCase,
        ID_GENERATOR,
        CLOCK,
      ],
      useFactory: (
        servers: McpServerRepository,
        capabilities: McpEngineCapabilities,
        dialects: McpEngineDialects,
        trail: RecordAuditEventUseCase,
        ids: IdGenerator,
        clock: Clock,
      ): McpServerDependencies => ({ servers, capabilities, dialects, trail, ids, clock }),
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
  ],
})
export class McpModule {}
