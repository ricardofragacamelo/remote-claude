import { DomainError } from '@domain/shared';

/**
 * How long a client waits before asking again: long enough for a person to close the editor that
 * spent the budget, short enough not to read as "never".
 */
export const WATCH_RETRY_AFTER_SECONDS = 30;

/**
 * The operating system refused another watch — the machine's inotify budget is spent — `503`.
 *
 * Said, never swallowed: a tree that silently stops updating is worse than one that says it
 * cannot. It carries `retryAfterSeconds`, like every `503` ([07 · D-08](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-08--a-implementação-do-watcher)).
 */
export class WatchUnavailableError extends DomainError {
  readonly code = 'WATCH_UNAVAILABLE';
  readonly messageKey = 'files.error.watchUnavailable';

  constructor(retryAfterSeconds: number) {
    super('the operating system refused another watch', { retryAfterSeconds });
  }
}
