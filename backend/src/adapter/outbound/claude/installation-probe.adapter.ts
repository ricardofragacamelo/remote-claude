import { Inject, Injectable } from '@nestjs/common';

import type { InstallationAnswer, InstallationProbe } from '@application/claude-config';
import type { WorkspacePath } from '@domain/workspace';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { BUNDLED_CLI_VERSION } from './cli-version';
import { EphemeralClaude } from './ephemeral-claude';
import { toSessionInitialization } from './initialization-mapping';
import { COMMANDS_TIMEOUT_MS } from './session-runner';

/**
 * The probe of the installation over the Agent SDK (plan 13, D-05): a query that never takes a
 * prompt, asks `initializationResult()` — one question for the commands, agents, models, styles and
 * account — and is closed in the `finally`. Measured at ~0.3–1.3 s and ~230 MB, one process, no
 * message on the stream (discovery §11, #4).
 *
 * It takes a slot of the capacity of sessions while it lives, as any session does: the machine
 * holds the subprocess either way (S-21).
 */
@Injectable()
export class AgentSdkInstallationProbe implements InstallationProbe {
  constructor(
    @Inject(EphemeralClaude) private readonly claude: EphemeralClaude,
    @Inject(BUNDLED_CLI_VERSION) private readonly cliVersion: string | null,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async probe(folder: WorkspacePath): Promise<InstallationAnswer> {
    const startedAt = Date.now();
    const init = await this.claude.ask(
      {
        cwd: folder.value,
        op: 'claude.probe',
        subject: folder.value,
        what: 'answer the probe',
        timeoutMs: COMMANDS_TIMEOUT_MS,
      },
      (query) => query.initializationResult(),
    );

    this.logger.debug(
      {
        op: 'claude.probe',
        layer: 'adapter',
        workspacePath: folder.value,
        models: init.models.length,
        agents: init.agents.length,
        durationMs: Date.now() - startedAt,
      },
      'the probe answered',
    );

    return { cliVersion: this.cliVersion, initialization: toSessionInitialization(init) };
  }
}
