import { Module } from '@nestjs/common';

import { ClaudeConfigController } from '@adapter/inbound/http/claude-config/claude-config.controller';
import { BUNDLED_CLI_VERSION } from '@adapter/outbound/claude/cli-version';
import { EphemeralClaude } from '@adapter/outbound/claude/ephemeral-claude';
import { NodeInstallationFacts } from '@adapter/outbound/claude/installation-facts.adapter';
import { AgentSdkInstallationProbe } from '@adapter/outbound/claude/installation-probe.adapter';
import {
  AgentSdkModelCheck,
  MODEL_CHECK_SETTINGS,
  MODEL_CHECK_TIMEOUT_MS,
} from '@adapter/outbound/claude/model-check.adapter';
import { RegistryLiveInstallation } from '@adapter/outbound/claude-config/registry-live-installation';
import { WorkspaceModuleFolderAccess } from '@adapter/outbound/claude-config/workspace-module.folder-access';
import { DrizzleClaudeDefaultsRepository } from '@adapter/outbound/persistence/claude-config/drizzle-claude-defaults.repository';
import { RecordAuditEventUseCase } from '@application/audit';
import {
  CheckModelUseCase,
  CLAUDE_DEFAULTS_REPOSITORY,
  ClaudeInstallationCatalog,
  ClearFolderDefaultsUseCase,
  ComposeSessionConfigurationUseCase,
  FOLDER_ACCESS,
  INSTALLATION_FACTS,
  INSTALLATION_PROBE,
  LIVE_INSTALLATION,
  MODEL_CHECK,
  ModelChecks,
  ReadAccountUseCase,
  ReadDefaultsUseCase,
  ReadInstallationUseCase,
  ReadModelsUseCase,
  SaveDefaultsUseCase,
} from '@application/claude-config';
import type {
  ClaudeDefaultsRepository,
  DefaultsDependencies,
  FolderAccess,
  InstallationFacts,
  InstallationProbe,
  LiveInstallation,
  ModelCheck,
} from '@application/claude-config';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { AuditModule } from './audit.module';
import { AuthModule } from './auth.module';
import { ClaudeSdkModule } from './claude-sdk.module';
import { SessionRegistryModule } from './session-registry.module';
import { WorkspaceModule } from './workspace.module';

/** What every defaults use case is built with. */
const DEFAULTS_DEPENDENCIES = Symbol('DefaultsDependencies');

/**
 * The `claude-config` module: how Claude works on this machine, per user — defaults, MCP servers,
 * the approvals of a repository's `.mcp.json`, plugins and skills (plan 13).
 *
 * It owns no live session and no permission rule. The session asks it through a port the session
 * declares (`SessionConfigurationSource`); it reaches the live sessions through the registry module,
 * never by importing `session` — the `claude-config-never-reaches-session` rule refuses that, because
 * the session module imports this one. Every contact with the SDK — the probe, the model check —
 * lives in `adapter/outbound/claude/`, as backend/04 asks.
 *
 * See docs/architecture/backend/03-modules.md#claude-config.
 */
@Module({
  imports: [AuditModule, AuthModule, ClaudeSdkModule, SessionRegistryModule, WorkspaceModule],
  controllers: [ClaudeConfigController],
  providers: [
    { provide: CLAUDE_DEFAULTS_REPOSITORY, useClass: DrizzleClaudeDefaultsRepository },
    { provide: FOLDER_ACCESS, useClass: WorkspaceModuleFolderAccess },
    { provide: LIVE_INSTALLATION, useClass: RegistryLiveInstallation },
    EphemeralClaude,
    { provide: INSTALLATION_PROBE, useClass: AgentSdkInstallationProbe },
    { provide: MODEL_CHECK, useClass: AgentSdkModelCheck },
    {
      provide: MODEL_CHECK_SETTINGS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        ...config.claudeConfig.modelCheck,
        timeoutMs: MODEL_CHECK_TIMEOUT_MS,
      }),
    },
    {
      provide: INSTALLATION_FACTS,
      inject: [LOGGER],
      useFactory: (logger: Logger) => new NodeInstallationFacts(logger),
    },
    {
      provide: ClaudeInstallationCatalog,
      inject: [
        LIVE_INSTALLATION,
        INSTALLATION_PROBE,
        CLOCK,
        BUNDLED_CLI_VERSION,
        INSTALLATION_FACTS,
      ],
      useFactory: (
        live: LiveInstallation,
        probe: InstallationProbe,
        clock: Clock,
        cliVersion: string | null,
        facts: InstallationFacts,
      ) =>
        new ClaudeInstallationCatalog(live, probe, clock, {
          cliVersion,
          configDir: facts.configDir.path,
        }),
    },
    {
      provide: ModelChecks,
      inject: [MODEL_CHECK, CLOCK],
      useFactory: (check: ModelCheck, clock: Clock) => new ModelChecks(check, clock),
    },
    {
      provide: DEFAULTS_DEPENDENCIES,
      inject: [
        CLAUDE_DEFAULTS_REPOSITORY,
        FOLDER_ACCESS,
        ClaudeInstallationCatalog,
        RecordAuditEventUseCase,
        CLOCK,
      ],
      useFactory: (
        defaults: ClaudeDefaultsRepository,
        folders: FolderAccess,
        catalog: ClaudeInstallationCatalog,
        trail: RecordAuditEventUseCase,
        clock: Clock,
      ): DefaultsDependencies => ({ defaults, folders, catalog, trail, clock }),
    },
    {
      provide: ReadAccountUseCase,
      inject: [FOLDER_ACCESS, ClaudeInstallationCatalog],
      useFactory: (folders: FolderAccess, catalog: ClaudeInstallationCatalog) =>
        new ReadAccountUseCase(folders, catalog),
    },
    {
      provide: ReadInstallationUseCase,
      inject: [INSTALLATION_FACTS, ClaudeInstallationCatalog, ModelChecks],
      useFactory: (
        facts: InstallationFacts,
        catalog: ClaudeInstallationCatalog,
        checks: ModelChecks,
      ) => new ReadInstallationUseCase(facts, catalog, checks),
    },
    {
      provide: CheckModelUseCase,
      inject: [ModelChecks],
      useFactory: (checks: ModelChecks) => new CheckModelUseCase(checks),
    },
    {
      provide: ReadModelsUseCase,
      inject: [FOLDER_ACCESS, ClaudeInstallationCatalog],
      useFactory: (folders: FolderAccess, catalog: ClaudeInstallationCatalog) =>
        new ReadModelsUseCase(folders, catalog),
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
      inject: [CLAUDE_DEFAULTS_REPOSITORY, ClaudeInstallationCatalog],
      useFactory: (defaults: ClaudeDefaultsRepository, catalog: ClaudeInstallationCatalog) =>
        new ComposeSessionConfigurationUseCase(defaults, catalog),
    },
  ],
  exports: [ComposeSessionConfigurationUseCase, ClaudeInstallationCatalog],
})
export class ClaudeConfigModule {}
