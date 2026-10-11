import { DomainError } from '@domain/shared';

/**
 * The coding agent did not answer a request within the deadline.
 *
 * Every call that leaves the process has an explicit deadline
 * (docs/architecture/shared/04-errors-and-http.md). `504`, because upstream did not answer — a
 * different alarm from upstream answering with a failure, which is `AGENT_UNAVAILABLE`.
 */
export class AgentTimeoutError extends DomainError {
  readonly code = 'AGENT_TIMEOUT';

  /**
   * @param engine the engine asked
   * @param subject who asked — a live session, or what read the history
   * @param operation what was asked, in the log's words
   * @param timeoutMs the deadline it missed
   * @param messageKey `session.error.agentTimeout`, or the history's own
   */
  constructor(
    engine: string,
    subject: string,
    operation: string,
    timeoutMs: number,
    readonly messageKey = 'session.error.agentTimeout',
  ) {
    super(`${subject} (${engine}) did not ${operation} within ${String(timeoutMs)} ms`, {
      engine,
      operation,
      timeoutMs,
    });
  }
}
