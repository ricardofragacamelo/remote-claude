import { Inject, Injectable } from '@nestjs/common';

import {
  SESSION_FILE_JOURNAL,
  SESSION_PERMISSION_GATE,
  TOOL_INVOCATION_RECORDER,
} from '@application/session';
import type {
  ClaudeSessionHandle,
  ClaudeSessionPort,
  ClaudeSessionStart,
  SessionFileJournal,
  SessionPermissionGate,
  ToolInvocationRecorder,
} from '@application/session';
import { CLOCK, SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import type { Clock } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { BUNDLED_CLI_VERSION } from './cli-version';
import { QUERY_FACTORY } from './query.factory';
import type { QueryFactory } from './query.factory';
import { SESSION_LIMITS } from './session-limits';
import type { SessionLimits } from './sdk-options.factory';
import { SessionRunner } from './session-runner';

/**
 * The Agent SDK, behind the port.
 *
 * The technology is in the name on purpose: reading it tells you what breaks the day the SDK
 * changes. It is also the only class in the application allowed to know the SDK exists — the
 * dependency-cruiser rule `sdk-is-isolated` fails the build on any import of `@anthropic-ai/*`
 * outside this folder, and that rule was written before the folder was.
 */
@Injectable()
export class AgentSdkClaudeSessionAdapter implements ClaudeSessionPort {
  constructor(
    @Inject(QUERY_FACTORY) private readonly createQuery: QueryFactory,
    @Inject(TOOL_INVOCATION_RECORDER) private readonly recorder: ToolInvocationRecorder,
    @Inject(SESSION_FILE_JOURNAL) private readonly journal: SessionFileJournal,
    @Inject(SESSION_PERMISSION_GATE) private readonly permissions: SessionPermissionGate,
    @Inject(SESSION_LIMITS) private readonly limits: SessionLimits,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SCHEDULER) private readonly scheduler: Scheduler,
    // Read once, when the container is built: the binary the SDK spawns does not change while the
    // process runs.
    @Inject(BUNDLED_CLI_VERSION) private readonly cliVersion: string | null,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  start(input: ClaudeSessionStart): Promise<ClaudeSessionHandle> {
    const runner = new SessionRunner(input, {
      createQuery: this.createQuery,
      recorder: this.recorder,
      journal: this.journal,
      permissions: this.permissions,
      limits: this.limits,
      clock: this.clock,
      scheduler: this.scheduler,
      bundledCliVersion: this.cliVersion,
      logger: this.logger,
    });

    // Synchronous, and the signature is still a promise: spawning is synchronous today and the
    // port must not promise otherwise, because a future SDK that awaits the subprocess would
    // change every caller if this were typed as returning a value.
    runner.run();

    return Promise.resolve(runner);
  }
}
