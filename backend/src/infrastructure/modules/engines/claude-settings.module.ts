import { Module } from '@nestjs/common';

import { ClaudeController } from '@adapter/inbound/http/engines/claude/claude.controller';
import { CLAUDE_ENGINE } from '@adapter/outbound/engines/claude/claude-engine';
import {
  AgentSdkModelCheck,
  MODEL_CHECK_SETTINGS,
  MODEL_CHECK_TIMEOUT_MS,
} from '@adapter/outbound/engines/claude/model-check.adapter';
import { FOLDER_ACCESS } from '@application/agent-settings';
import type { FolderAccess } from '@application/agent-settings';
import { RecordAuditEventUseCase } from '@application/audit';
import {
  CheckModelUseCase,
  ClaudeInstallationCatalog,
  INSTALLATION_FACTS,
  MODEL_CHECK,
  ModelChecks,
  OUTPUT_STYLE_DEFAULTS_REPOSITORY,
  ReadAccountUseCase,
  ReadInstallationUseCase,
  ReadOutputStyleUseCase,
  SaveOutputStyleUseCase,
} from '@application/engines/claude';
import type {
  InstallationFacts,
  ModelCheck,
  OutputStyleDefaultsRepository,
  OutputStyleDependencies,
} from '@application/engines/claude';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { AgentSettingsModule } from '../agent-settings.module';
import { AuditModule } from '../audit.module';
import { AuthModule } from '../auth.module';
import { ClaudeInstallationModule } from './claude-installation.module';
import { CLAUDE_SETTINGS } from './claude.environment';
import type { ClaudeSettings } from './claude.environment';

/** What every output-style use case is built with. */
const OUTPUT_STYLE_DEPENDENCIES = Symbol('OutputStyleDependencies');

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
  controllers: [ClaudeController],
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
  ],
})
export class ClaudeSettingsModule {}
