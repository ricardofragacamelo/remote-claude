import { Inject, Injectable } from '@nestjs/common';

import { ComposeSessionConfigurationUseCase } from '@application/claude-config';
import type {
  SessionConfiguration,
  SessionConfigurationRequest,
  SessionConfigurationSource,
} from '@application/session';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * `session` asking `claude-config` what a new session opens with — the whole of the coupling
 * between the two (plan 13, B-15, D-03). A default the installation no longer has is dropped there,
 * and said here, in `warn`: the session opens with the installation's instead (S-51, S-53).
 */
@Injectable()
export class ClaudeConfigModuleConfiguration implements SessionConfigurationSource {
  constructor(
    @Inject(ComposeSessionConfigurationUseCase)
    private readonly compose: ComposeSessionConfigurationUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async configurationFor(query: SessionConfigurationRequest): Promise<SessionConfiguration> {
    const { defaults } = await this.compose.execute(query);

    if (defaults.stale.length > 0) {
      this.logger.warn(
        {
          op: 'claude.defaults',
          layer: 'adapter',
          workspacePath: query.workspace.value,
          stale: defaults.stale,
        },
        'a default the installation no longer has was dropped for its own',
      );
    }

    return {
      model: defaults.model,
      permissionMode: defaults.permissionMode,
      effort: defaults.effort,
      thinking: defaults.thinking,
      outputStyle: defaults.outputStyle,
      fallbackModel: defaults.fallbackModel,
      defaultsFrom: defaults.from,
    };
  }
}
