import { DomainError } from '@domain/shared';

/**
 * The coding agent of a session failed or died.
 *
 * `502` and not `500`: it is upstream that fell over, not us. The distinction is what lets an
 * operator tell "our bug" from "the agent is unhappy on this machine" without reading a stack trace
 * — see docs/architecture/shared/04-errors-and-http.md. `params.engine` says which agent.
 */
export class AgentUnavailableError extends DomainError {
  readonly code = 'AGENT_UNAVAILABLE';

  /**
   * @param engine the engine of the session
   * @param subject what failed — a live session, or what read the history
   * @param messageKey `session.error.agentUnavailable`, or the history's own
   */
  constructor(
    engine: string,
    subject: string,
    readonly messageKey = 'session.error.agentUnavailable',
  ) {
    super(`the agent ${engine} of ${subject} ended in failure`, { engine, sessionId: subject });
  }
}
