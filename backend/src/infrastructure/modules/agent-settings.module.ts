import { Module } from '@nestjs/common';

import { AgentSettingsController } from '@adapter/inbound/http/agent-settings/agent-settings.controller';
import { WorkspaceModuleFolderAccess } from '@adapter/outbound/agent-settings/workspace-module.folder-access';
import { DrizzleAgentDefaultsRepository } from '@adapter/outbound/persistence/agent-settings/drizzle-agent-defaults.repository';
import {
  AGENT_DEFAULTS_REPOSITORY,
  ClearFolderDefaultsUseCase,
  ComposeSessionConfigurationUseCase,
  EngineSettings,
  FOLDER_ACCESS,
  ReadDefaultsUseCase,
  ReadModelsUseCase,
  SaveDefaultsUseCase,
} from '@application/agent-settings';
import type {
  AgentDefaultsRepository,
  DefaultsDependencies,
  FolderAccess,
} from '@application/agent-settings';
import { RecordAuditEventUseCase } from '@application/audit';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { AuditModule } from './audit.module';
import { AuthModule } from './auth.module';
import { EngineSettingsModule } from './engines/engine-settings.module';
import { WorkspaceModule } from './workspace.module';

/** What every defaults use case is built with. */
const DEFAULTS_DEPENDENCIES = Symbol('DefaultsDependencies');

/**
 * The `agent-settings` module: the defaults a session of each engine opens with, per user and by
 * engine, and the models of each engine's installation (plan 13; plan 28, B-36, D-06).
 *
 * It owns no live session and names no engine. The session asks it through a port the session
 * declares (`SessionConfigurationSource`); the engines it keeps settings for come from the registry
 * the composition builds (`EngineSettings`) — what only one engine has is that engine's extension.
 * The `settings-never-reach-session` rule refuses an import of the application of `session` here,
 * because the session module imports this one.
 *
 * See docs/architecture/backend/03-modules.md#agent-settings.
 */
@Module({
  imports: [AuditModule, AuthModule, EngineSettingsModule, WorkspaceModule],
  controllers: [AgentSettingsController],
  providers: [
    { provide: AGENT_DEFAULTS_REPOSITORY, useClass: DrizzleAgentDefaultsRepository },
    { provide: FOLDER_ACCESS, useClass: WorkspaceModuleFolderAccess },
    {
      provide: DEFAULTS_DEPENDENCIES,
      inject: [
        AGENT_DEFAULTS_REPOSITORY,
        FOLDER_ACCESS,
        EngineSettings,
        RecordAuditEventUseCase,
        CLOCK,
      ],
      useFactory: (
        defaults: AgentDefaultsRepository,
        folders: FolderAccess,
        engines: EngineSettings,
        trail: RecordAuditEventUseCase,
        clock: Clock,
      ): DefaultsDependencies => ({ defaults, folders, engines, trail, clock }),
    },
    {
      provide: ReadModelsUseCase,
      inject: [FOLDER_ACCESS, EngineSettings],
      useFactory: (folders: FolderAccess, engines: EngineSettings) =>
        new ReadModelsUseCase(folders, engines),
    },
    {
      provide: ReadDefaultsUseCase,
      inject: [DEFAULTS_DEPENDENCIES],
      useFactory: (deps: DefaultsDependencies) => new ReadDefaultsUseCase(deps),
    },
    {
      provide: SaveDefaultsUseCase,
      inject: [DEFAULTS_DEPENDENCIES],
      useFactory: (deps: DefaultsDependencies) => new SaveDefaultsUseCase(deps),
    },
    {
      provide: ClearFolderDefaultsUseCase,
      inject: [DEFAULTS_DEPENDENCIES],
      useFactory: (deps: DefaultsDependencies) => new ClearFolderDefaultsUseCase(deps),
    },
    {
      provide: ComposeSessionConfigurationUseCase,
      inject: [AGENT_DEFAULTS_REPOSITORY, EngineSettings],
      useFactory: (defaults: AgentDefaultsRepository, engines: EngineSettings) =>
        new ComposeSessionConfigurationUseCase(defaults, engines),
    },
  ],
  exports: [
    FOLDER_ACCESS,
    ReadModelsUseCase,
    ReadDefaultsUseCase,
    SaveDefaultsUseCase,
    ClearFolderDefaultsUseCase,
    ComposeSessionConfigurationUseCase,
  ],
})
export class AgentSettingsModule {}
