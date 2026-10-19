import { DomainError } from '@domain/shared';

/**
 * An engine this installation does not drive, or one that does not carry the `mcp` capability
 * (plan 13, B-19; plan 28, F1). `404`: the route is simply not there for this engine, the same
 * answer for a name that never existed — the refusal
 * [28 · F1](../../../../../docs/plans/28-agent-neutral-core/F1-engine-port.md) defines for a
 * capability a session's engine does not have.
 */
export class McpEngineNotSupportedError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly messageKey = 'common.error.notFound';

  constructor(engine: string) {
    super(`no enabled engine named ${engine} carries the mcp capability`, { engine });
  }
}
