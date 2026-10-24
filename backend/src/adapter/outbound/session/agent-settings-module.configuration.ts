import { Inject, Injectable } from '@nestjs/common';

import { ComposeSessionConfigurationUseCase } from '@application/agent-settings';
import type {
  SessionConfiguration,
  SessionConfigurationRequest,
  SessionConfigurationSource,
} from '@application/session';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * `session` asking `agent-settings` what a new session opens with — the whole of the coupling
 * between the two (plan 13, B-15, D-03; plan 28, B-36). A default the installation no longer has is
 * dropped there, and said here, in `warn`: the session opens with the installation's instead (S-51,
 * S-53).
 */
@Injectable()
export class AgentSettingsModuleConfiguration implements SessionConfigurationSource {
  constructor(
    @Inject(ComposeSessionConfigurationUseCase)
    private readonly compose: ComposeSessionConfigurationUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async configurationFor(query: SessionConfigurationRequest): Promise<SessionConfiguration> {
    const { defaults, outputStyle, stale, skills } = await this.compose.execute(query);

    if (stale.length > 0) {
      this.logger.warn(
        {
          op: 'agentSettings.defaults',
          layer: 'adapter',
          engine: query.engine,
          workspacePath: query.workspace.value,
          stale,
        },
        'a default the installation no longer has was dropped for its own',
      );
    }

    return {
      model: defaults.model,
      permissionMode: defaults.permissionMode,
      effort: defaults.effort,
      thinking: defaults.thinking,
      outputStyle,
      fallbackModel: defaults.fallbackModel,
      defaultsFrom: defaults.from,
      skills,
    };
  }
}
