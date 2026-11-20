import { DomainError } from '@domain/shared';

/** Which rule of `SearchQuery.create` a field broke. The client translates the rule. */
export type SearchQueryRule = 'patternRequired' | 'patternTooLong' | 'tooManyGlobs';

/** One field of the request and one rule it broke. */
export interface SearchQueryViolation {
  readonly field: string;
  readonly rule: SearchQueryRule;
}

/**
 * The query is not even well-formed — refused before a process is ever considered.
 *
 * Carries **every** rule every field broke, so a request with three mistakes is one round trip,
 * not three (S-44) — the same shape `InvalidFilePathError` uses for the same reason. A glob or a
 * path that reaches outside the folder is a different, more specific error
 * ({@link GlobOutsideFolderError}, {@link PathOutsideFolderError}): the request was otherwise
 * well-formed, and only the boundary was wrong.
 */
export class SearchQueryInvalidError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'search.error.queryInvalid';

  readonly details: readonly SearchQueryViolation[];

  constructor(violations: readonly SearchQueryViolation[]) {
    super(`the search query is not well-formed: ${describe(violations)}`);
    this.details = violations;
  }
}

function describe(violations: readonly SearchQueryViolation[]): string {
  return violations.map((violation) => `${violation.field}:${violation.rule}`).join(', ');
}
