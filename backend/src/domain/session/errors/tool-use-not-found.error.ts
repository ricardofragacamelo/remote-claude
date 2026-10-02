import { DomainError } from '@domain/shared';

/**
 * A diff asked of a tool invocation this session does not have.
 *
 * `404` and not `INVALID_INPUT`: the id is well formed, and it names nothing here — a tool of
 * another session, or one the trail never saw (plan 08, B-25).
 */
export class ToolUseNotFoundError extends DomainError {
  readonly code = 'TOOL_USE_NOT_FOUND';
  readonly messageKey = 'session.error.toolUseNotFound';

  constructor(toolUseId: string) {
    super(`no tool invocation ${toolUseId} in this session`, { toolUseId });
  }
}
