import { Module } from '@nestjs/common';

import { ClaudeController } from '@adapter/inbound/http/engines/claude/claude.controller';
import { PluginsController } from '@adapter/inbound/http/engines/claude/plugins.controller';
import { CLAUDE_ENGINE } from '@adapter/outbound/engines/claude/claude-engine';
import { DrizzlePluginRepository } from '@adapter/outbound/engines/claude/drizzle-plugin.repository';
import {
  AgentSdkModelCheck,
  MODEL_CHECK_SETTINGS,
  MODEL_CHECK_TIMEOUT_MS,
} from '@adapter/outbound/engines/claude/model-check.adapter';
import { ClaudePluginManifestReader } from '@adapter/outbound/engines/claude/plugin-manifest.reader';
import { FOLDER_ACCESS } from '@application/agent-settings';
import type { FolderAccess } from '@application/agent-settings';
import { RecordAuditEventUseCase } from '@application/audit';
import {
  AddLocalPluginUseCase,
  CheckModelUseCase,
  ClaudeInstallationCatalog,
  INSTALLATION_FACTS,
  ListPluginsUseCase,
  MODEL_CHECK,
  ModelChecks,
  OUTPUT_STYLE_DEFAULTS_REPOSITORY,
  PLUGIN_MANIFEST_READER,
  PLUGIN_REPOSITORY,
  PreviewLocalPluginUseCase,
  ReadAccountUseCase,
  ReadInstallationUseCase,
  ReadOutputStyleUseCase,
  RemovePluginUseCase,
  SaveOutputStyleUseCase,
  SetPluginEnabledUseCase,
} from '@application/engines/claude';
import type {
  InstallationFacts,
  ModelCheck,
  OutputStyleDefaultsRepository,
  OutputStyleDependencies,
  PluginDependencies,
  PluginManifestReader,
  PluginRepository,
} from '@application/engines/claude';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { AgentSettingsModule } from '../agent-settings.module';
import { AuditModule } from '../audit.module';
import { AuthModule } from '../auth.module';
import { ClaudeInstallationModule } from './claude-installation.module';
import { CLAUDE_SETTINGS } from './claude.environment';
import type { ClaudeSettings } from './claude.environment';

/** What every output-style use case is built with. */
const OUTPUT_STYLE_DEPENDENCIES = Symbol('OutputStyleDependencies');

/** What every plugin use case is built with (plan 13, B-27). */
const PLUGIN_DEPENDENCIES = Symbol('PluginDependencies');

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
  imports: [AgentSettingsModule, AuditModule, AuthModule, ClaudeInstallationModule],
  controllers: [ClaudeController, PluginsController],
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
      provide: PLUGIN_DEPENDENCIES,
      inject: [
        PLUGIN_REPOSITORY,
        PLUGIN_MANIFEST_READER,
        FOLDER_ACCESS,
        RecordAuditEventUseCase,
        ID_GENERATOR,
        CLOCK,
      ],
      useFactory: (
        plugins: PluginRepository,
        manifests: PluginManifestReader,
        folders: FolderAccess,
        trail: RecordAuditEventUseCase,
        ids: IdGenerator,
        clock: Clock,
      ): PluginDependencies => ({
        engine: CLAUDE_ENGINE,
        plugins,
        manifests,
        folders,
        trail,
        ids,
        clock,
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
  ],
})
export class ClaudeSettingsModule {}
