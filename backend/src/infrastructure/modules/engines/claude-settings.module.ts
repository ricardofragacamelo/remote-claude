import { Module } from '@nestjs/common';

import { ClaudeController } from '@adapter/inbound/http/engines/claude/claude.controller';
import { MarketplacesController } from '@adapter/inbound/http/engines/claude/marketplaces.controller';
import { PluginsController } from '@adapter/inbound/http/engines/claude/plugins.controller';
import { CLAUDE_ENGINE } from '@adapter/outbound/engines/claude/claude-engine';
import { DrizzlePluginRepository } from '@adapter/outbound/engines/claude/drizzle-plugin.repository';
import {
  GitMarketplacePluginSource,
  MARKETPLACE_PLUGIN_SOURCE_SETTINGS,
} from '@adapter/outbound/engines/claude/git-marketplace-plugin-source';
import type { MarketplacePluginSourceSettings } from '@adapter/outbound/engines/claude/git-marketplace-plugin-source';
import {
  AgentSdkModelCheck,
  MODEL_CHECK_SETTINGS,
  MODEL_CHECK_TIMEOUT_MS,
} from '@adapter/outbound/engines/claude/model-check.adapter';
import { ClaudePluginManifestReader } from '@adapter/outbound/engines/claude/plugin-manifest.reader';
import { ClaudeProjectConfigFileReader } from '@adapter/outbound/engines/claude/project-config-file.reader';
import { RegistryLiveLoadedState } from '@adapter/outbound/engines/claude/registry-live-loaded-state';
import { FOLDER_ACCESS } from '@application/agent-settings';
import type { FolderAccess } from '@application/agent-settings';
import { RecordAuditEventUseCase } from '@application/audit';
import {
  AddLocalPluginUseCase,
  AddMarketplacePluginUseCase,
  ApplyMarketplacePluginUpdateUseCase,
  CheckModelUseCase,
  CheckMarketplacePluginUpdateUseCase,
  ClaudeInstallationCatalog,
  INSTALLATION_FACTS,
  LIVE_LOADED_STATE,
  ListMarketplacePluginsUseCase,
  ListMarketplacesUseCase,
  ListPluginsUseCase,
  MARKETPLACE_PLUGIN_SOURCE,
  MODEL_CHECK,
  ModelChecks,
  OUTPUT_STYLE_DEFAULTS_REPOSITORY,
  PLUGIN_MANIFEST_READER,
  PLUGIN_REPOSITORY,
  PreviewLocalPluginUseCase,
  PROJECT_CONFIG_SOURCE,
  ReadAccountUseCase,
  ReadInstallationUseCase,
  ReadOutputStyleUseCase,
  ReadProjectConfigUseCase,
  RemovePluginUseCase,
  SaveOutputStyleUseCase,
  SetPluginEnabledUseCase,
} from '@application/engines/claude';
import type {
  InstallationFacts,
  MarketplacePluginSource,
  ModelCheck,
  OutputStyleDefaultsRepository,
  OutputStyleDependencies,
  PluginDependencies,
  PluginManifestReader,
  PluginRepository,
  ProjectConfigDependencies,
} from '@application/engines/claude';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import { MARKETPLACE_ALLOWLIST_SOURCE } from '@application/workspace';
import type { MarketplaceAllowlistSource } from '@application/workspace';
import type { Clock, IdGenerator } from '@domain/shared';
import { AgentSettingsModule } from '../agent-settings.module';
import { AuditModule } from '../audit.module';
import { AuthModule } from '../auth.module';
import { SessionRegistryModule } from '../session-registry.module';
import { WorkspaceModule } from '../workspace.module';
import { ClaudeInstallationModule } from './claude-installation.module';
import { CLAUDE_SETTINGS } from './claude.environment';
import type { ClaudeSettings } from './claude.environment';

/** What every output-style use case is built with. */
const OUTPUT_STYLE_DEPENDENCIES = Symbol('OutputStyleDependencies');

/** What every plugin use case (local and marketplace, B-27 and B-47) is built with. */
const PLUGIN_DEPENDENCIES = Symbol('PluginDependencies');

/** What `ReadProjectConfigUseCase` (B-31) is built with. */
const PROJECT_CONFIG_DEPENDENCIES = Symbol('ProjectConfigDependencies');

/**
 * The settings only Claude has, composed (plan 13; plan 28, B-36, D-06): the account of its CLI,
 * the diagnostic of its installation, the test of the connection and the output style of its
 * sessions. The defaults and the models every engine has are the core's (`agent-settings`), asked
 * here for Claude by name.
 *
 * It owns no live session and no permission rule; every contact with the SDK — the probe, the model
 * check — lives in `adapter/outbound/engines/claude/`, as backend/04 asks.
 *
 * See docs/architecture/backend/03-modules.md.
 */
@Module({
  imports: [
    AgentSettingsModule,
    AuditModule,
    AuthModule,
    ClaudeInstallationModule,
    SessionRegistryModule,
    WorkspaceModule,
  ],
  controllers: [MarketplacesController, ClaudeController, PluginsController],
  providers: [
    { provide: MODEL_CHECK, useClass: AgentSdkModelCheck },
    {
      provide: MODEL_CHECK_SETTINGS,
      inject: [CLAUDE_SETTINGS],
      useFactory: (settings: ClaudeSettings) => ({
        ...settings.modelCheck,
        timeoutMs: MODEL_CHECK_TIMEOUT_MS,
      }),
    },
    {
      provide: ModelChecks,
      inject: [MODEL_CHECK, CLOCK],
      useFactory: (check: ModelCheck, clock: Clock) => new ModelChecks(check, clock),
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
      provide: OUTPUT_STYLE_DEPENDENCIES,
      inject: [OUTPUT_STYLE_DEFAULTS_REPOSITORY, FOLDER_ACCESS, RecordAuditEventUseCase, CLOCK],
      useFactory: (
        styles: OutputStyleDefaultsRepository,
        folders: FolderAccess,
        trail: RecordAuditEventUseCase,
        clock: Clock,
      ): OutputStyleDependencies => ({ engine: CLAUDE_ENGINE, styles, folders, trail, clock }),
    },
    {
      provide: ReadOutputStyleUseCase,
      inject: [OUTPUT_STYLE_DEPENDENCIES],
      useFactory: (deps: OutputStyleDependencies) => new ReadOutputStyleUseCase(deps),
    },
    {
      provide: SaveOutputStyleUseCase,
      inject: [OUTPUT_STYLE_DEPENDENCIES],
      useFactory: (deps: OutputStyleDependencies) => new SaveOutputStyleUseCase(deps),
    },
    { provide: PLUGIN_REPOSITORY, useClass: DrizzlePluginRepository },
    { provide: PLUGIN_MANIFEST_READER, useClass: ClaudePluginManifestReader },
    {
      provide: MARKETPLACE_PLUGIN_SOURCE_SETTINGS,
      inject: [CLAUDE_SETTINGS],
      useFactory: (settings: ClaudeSettings): MarketplacePluginSourceSettings => ({
        baseDir: settings.pluginDownloadDir,
      }),
    },
    { provide: MARKETPLACE_PLUGIN_SOURCE, useClass: GitMarketplacePluginSource },
    {
      provide: PLUGIN_DEPENDENCIES,
      inject: [
        PLUGIN_REPOSITORY,
        PLUGIN_MANIFEST_READER,
        FOLDER_ACCESS,
        RecordAuditEventUseCase,
        ID_GENERATOR,
        CLOCK,
        MARKETPLACE_ALLOWLIST_SOURCE,
        MARKETPLACE_PLUGIN_SOURCE,
        CLAUDE_SETTINGS,
      ],
      useFactory: (
        plugins: PluginRepository,
        manifests: PluginManifestReader,
        folders: FolderAccess,
        trail: RecordAuditEventUseCase,
        ids: IdGenerator,
        clock: Clock,
        marketplaces: MarketplaceAllowlistSource,
        source: MarketplacePluginSource,
        settings: ClaudeSettings,
      ): PluginDependencies => ({
        engine: CLAUDE_ENGINE,
        plugins,
        manifests,
        folders,
        trail,
        ids,
        clock,
        marketplaces,
        source,
        pluginDownloadDir: settings.pluginDownloadDir,
      }),
    },
    {
      provide: ListPluginsUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new ListPluginsUseCase(deps),
    },
    {
      provide: PreviewLocalPluginUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new PreviewLocalPluginUseCase(deps),
    },
    {
      provide: AddLocalPluginUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new AddLocalPluginUseCase(deps),
    },
    {
      provide: SetPluginEnabledUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new SetPluginEnabledUseCase(deps),
    },
    {
      provide: RemovePluginUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new RemovePluginUseCase(deps),
    },
    {
      provide: ListMarketplacesUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new ListMarketplacesUseCase(deps),
    },
    {
      provide: ListMarketplacePluginsUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new ListMarketplacePluginsUseCase(deps),
    },
    {
      provide: AddMarketplacePluginUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new AddMarketplacePluginUseCase(deps),
    },
    {
      provide: CheckMarketplacePluginUpdateUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new CheckMarketplacePluginUpdateUseCase(deps),
    },
    {
      provide: ApplyMarketplacePluginUpdateUseCase,
      inject: [PLUGIN_DEPENDENCIES],
      useFactory: (deps: PluginDependencies) => new ApplyMarketplacePluginUpdateUseCase(deps),
    },
    { provide: PROJECT_CONFIG_SOURCE, useClass: ClaudeProjectConfigFileReader },
    { provide: LIVE_LOADED_STATE, useClass: RegistryLiveLoadedState },
    {
      provide: PROJECT_CONFIG_DEPENDENCIES,
      inject: [
        FOLDER_ACCESS,
        ClaudeInstallationCatalog,
        PROJECT_CONFIG_SOURCE,
        LIVE_LOADED_STATE,
        INSTALLATION_FACTS,
      ],
      useFactory: (
        folders: FolderAccess,
        catalog: ClaudeInstallationCatalog,
        source: ProjectConfigDependencies['source'],
        liveLoadedState: ProjectConfigDependencies['liveLoadedState'],
        facts: InstallationFacts,
      ): ProjectConfigDependencies => ({ folders, catalog, source, liveLoadedState, facts }),
    },
    {
      provide: ReadProjectConfigUseCase,
      inject: [PROJECT_CONFIG_DEPENDENCIES],
      useFactory: (deps: ProjectConfigDependencies) => new ReadProjectConfigUseCase(deps),
    },
  ],
})
export class ClaudeSettingsModule {}
