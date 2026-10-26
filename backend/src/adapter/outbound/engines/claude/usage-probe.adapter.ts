import { CLAUDE_ENGINE } from './claude-engine';
import { Inject, Injectable } from '@nestjs/common';

import type { UsageProbe } from '@application/engines/claude';
import { rateLimitWindowsFromUsageProbe } from '@domain/engines/claude';
import type { RateLimitWindow } from '@domain/engines/claude';
import type { Clock } from '@domain/shared';
import type { WorkspacePath } from '@domain/workspace';
import { CLOCK } from '@application/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { EphemeralClaude } from './ephemeral-claude';
import { COMMANDS_TIMEOUT_MS } from './session-runner';

/**
 * The account's rate-limit windows, read **without** a session open, over the SDK's own
 * `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` (plan 16, D-09's own research
 * rejected this as the *only* source — unstable, the shape may change without notice — but it is
 * the one way to answer the screen before any live session has pushed a `rate_limit_event`, which
 * is what the product now asks for; `SessionRunner.noteRateLimit` still keeps the live, categorical
 * readings this probe cannot give — a `status` this API never reports — so the two sources
 * complement rather than replace one another in the shared `RateLimitStore`).
 *
 * Read defensively, field by field, in {@link rateLimitWindowsFromUsageProbe}: an answer this build
 * does not recognise contributes no window rather than throwing, and a probe that fails or times
 * out is logged and answers `[]` — the caller falls back to whatever was last observed, exactly as
 * a failed write of usage never stops a session (plan 16's own principle for this module).
 */
@Injectable()
export class AgentSdkUsageProbe implements UsageProbe {
  constructor(
    @Inject(EphemeralClaude) private readonly claude: EphemeralClaude,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async probe(folder: WorkspacePath): Promise<readonly RateLimitWindow[]> {
    try {
      const answer = await this.claude.ask(
        {
          cwd: folder.value,
          op: 'engine.usageProbe',
          subject: folder.value,
          what: 'answer the usage probe',
          timeoutMs: COMMANDS_TIMEOUT_MS,
        },
        (query) => query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET(),
      );

      return rateLimitWindowsFromUsageProbe(answer.rate_limits, this.clock.now());
    } catch (error) {
      // Already logged by `EphemeralClaude.ask` itself — this is the usage-specific half: unlike
      // the installation probe, a failure here never surfaces to the caller as an error, because
      // the screen has a fallback (whatever the store already holds) that a thrown error would
      // throw away for nothing.
      this.logger.warn(
        { op: 'engine.usageProbe', layer: 'adapter', engine: CLAUDE_ENGINE, err: error },
        'the usage probe did not answer — showing what was last observed instead',
      );
      return [];
    }
  }
}
