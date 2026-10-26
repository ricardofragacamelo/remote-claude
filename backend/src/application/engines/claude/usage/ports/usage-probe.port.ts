import type { RateLimitWindow } from '@domain/engines/claude';
import type { WorkspacePath } from '@domain/workspace';

export const USAGE_PROBE = Symbol('UsageProbe');

/**
 * Asks the CLI for the account's rate-limit windows **without** a session open (plan 16, D-09 only
 * ever pushes a reading from a live `rate_limit_event`; this is the on-demand complement for a
 * screen opened when nothing has pushed one yet).
 *
 * Spawns a subprocess to ask, the same cost as {@link InstallationProbe} — a caller throttles how
 * often it probes, this port never does.
 */
export interface UsageProbe {
  /**
   * @throws {import('@domain/engine').AgentUnavailableError} the CLI failed, or died
   * @throws {import('@domain/engine').AgentTimeoutError} the CLI did not answer in time
   */
  probe(folder: WorkspacePath): Promise<readonly RateLimitWindow[]>;
}
