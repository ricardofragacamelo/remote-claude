import { DomainError } from '@domain/shared';

/**
 * The Agent SDK failed while reading the history.
 *
 * `502` and never `500`: the store belongs to the Claude installation, and a read that threw there
 * is upstream falling over, not a bug of ours. The distinction is what lets an operator alert on
 * the right thing (docs/architecture/shared/04-errors-and-http.md).
 */
export class TranscriptUnavailableError extends DomainError {
  readonly code = 'CLAUDE_UNAVAILABLE';
  readonly messageKey = 'transcript.error.claudeUnavailable';

  constructor(operation: string) {
    super(`the Agent SDK failed to ${operation}`, { operation });
  }
}
