import { Module } from '@nestjs/common';

import { EngineSettings } from '@application/agent-settings';
import { ClaudeModelCatalog, ClaudeSessionDefaults } from '@application/engines/claude';
import { EngineId } from '@domain/engine';
import { APP_CONFIG } from '../../config/environment';
import type { AppConfig } from '../../config/environment';
import { ClaudeInstallationModule } from './claude-installation.module';
import { enabledEngines } from './engine-selection';

/**
 * The settings of every engine the configuration enables, composed (plan 28, B-36): each engine's
 * catalogue of models and the defaults its extension keeps, in the registry the core's
 * `agent-settings` asks by name. Adding an engine adds its parts here, and nothing in the core.
 */
@Module({
  imports: [ClaudeInstallationModule],
  providers: [
    {
      provide: EngineSettings,
      inject: [APP_CONFIG, ClaudeModelCatalog, ClaudeSessionDefaults],
      useFactory: (
        config: AppConfig,
        claudeModels: ClaudeModelCatalog,
        claudeDefaults: ClaudeSessionDefaults,
      ) => {
        const { enabled } = enabledEngines(
          [
            {
              engine: EngineId.create(claudeModels.engine),
              models: claudeModels,
              defaults: claudeDefaults,
            },
          ],
          config.engines,
        );
        return new EngineSettings(
          enabled.map(({ models }) => models),
          enabled.map(({ defaults }) => defaults),
        );
      },
    },
  ],
  exports: [EngineSettings],
})
export class EngineSettingsModule {}
