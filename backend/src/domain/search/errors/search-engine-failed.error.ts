import { DomainError } from '@domain/shared';

/**
 * The ripgrep subprocess failed or disappeared.
 *
 * Same class as `AGENT_UNAVAILABLE`: a dependency that fell over, never a bug of ours. Before the
 * first byte of a streamed response this becomes a `502`; after it, it is the final NDJSON line
 * of the stream (ADR-016, [11 · D-02](../../../../../docs/plans/11-search/decisions.md#d-02--como-o-resultado-chega)).
 */
export class SearchEngineFailedError extends DomainError {
  readonly code = 'SEARCH_ENGINE_FAILED';
  readonly messageKey = 'search.error.engineFailed';

  constructor(reason: string) {
    super(`the search engine failed: ${reason}`, {});
  }
}
