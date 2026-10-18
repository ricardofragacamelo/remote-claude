import { Module } from '@nestjs/common';

import { BUNDLED_CLI_VERSION } from '@adapter/outbound/engines/claude/cli-version';
import { CLAUDE_ENGINE } from '@adapter/outbound/engines/claude/claude-engine';
import { CLAUDE_CAPABILITIES } from '@adapter/outbound/engines/claude/claude-capabilities';
import { DrizzleOutputStyleDefaultsRepository } from '@adapter/outbound/engines/claude/drizzle-output-style-defaults.repository';
import { EphemeralClaude } from '@adapter/outbound/engines/claude/ephemeral-claude';
import { NodeInstallationFacts } from '@adapter/outbound/engines/claude/installation-facts.adapter';
import { AgentSdkInstallationProbe } from '@adapter/outbound/engines/claude/installation-probe.adapter';
import { RegistryLiveInstallation } from '@adapter/outbound/engines/claude/registry-live-installation';
import {
  ClaudeInstallationCatalog,
  ClaudeModelCatalog,
  ClaudeSessionDefaults,
  INSTALLATION_FACTS,
  INSTALLATION_PROBE,
  LIVE_INSTALLATION,
  OUTPUT_STYLE_DEFAULTS_REPOSITORY,
} from '@application/engines/claude';
import type {
  InstallationFacts,
  InstallationProbe,
  LiveInstallation,
  OutputStyleDefaultsRepository,
} from '@application/engines/claude';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { processEnvironment } from '../../config/process-environment';
import { ClaudeEngineModule } from './claude.module';
import { CLAUDE_SETTINGS, loadClaudeSettings } from './claude.environment';
import { SessionRegistryModule } from '../session-registry.module';

/**
 * What Claude's installation says about itself, composed (plan 13, B-10; plan 28, B-36): the live
 * sessions that answer without a probe, the probe, what the installation is made of, the catalogue
 * that remembers their answers — and, built on it, what the core asks of any engine: its models, and
 * the output style its sessions open with. Imported by the core's settings through the registry the
 * composition builds, and by the extension's routes.
 */
@Module({
  imports: [ClaudeEngineModule, SessionRegistryModule],
  providers: [
    { provide: CLAUDE_SETTINGS, useFactory: () => loadClaudeSettings(processEnvironment()) },
    { provide: LIVE_INSTALLATION, useClass: RegistryLiveInstallation },
    EphemeralClaude,
    { provide: INSTALLATION_PROBE, useClass: AgentSdkInstallationProbe },
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
      provide: ClaudeModelCatalog,
      inject: [ClaudeInstallationCatalog],
      useFactory: (catalog: ClaudeInstallationCatalog) =>
        new ClaudeModelCatalog(CLAUDE_ENGINE, catalog, CLAUDE_CAPABILITIES.permissionModes),
    },
    { provide: OUTPUT_STYLE_DEFAULTS_REPOSITORY, useClass: DrizzleOutputStyleDefaultsRepository },
    {
      provide: ClaudeSessionDefaults,
      inject: [OUTPUT_STYLE_DEFAULTS_REPOSITORY, ClaudeInstallationCatalog],
      useFactory: (styles: OutputStyleDefaultsRepository, catalog: ClaudeInstallationCatalog) =>
        new ClaudeSessionDefaults(CLAUDE_ENGINE, styles, catalog),
    },
  ],
  exports: [
    CLAUDE_SETTINGS,
    EphemeralClaude,
    INSTALLATION_FACTS,
    ClaudeInstallationCatalog,
    ClaudeModelCatalog,
    OUTPUT_STYLE_DEFAULTS_REPOSITORY,
    ClaudeSessionDefaults,
  ],
})
export class ClaudeInstallationModule {}
