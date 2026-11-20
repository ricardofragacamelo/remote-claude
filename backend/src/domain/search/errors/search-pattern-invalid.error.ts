import { DomainError } from '@domain/shared';

/** Why the engine refused to compile the pattern. */
export type SearchPatternInvalidReason = 'syntax' | 'unsupported' | 'tooComplex';

/**
 * The ripgrep engine could not compile the pattern as a regular expression.
 *
 * `syntax` is a malformed expression, with the position the engine reported when it gave one;
 * `unsupported` is a feature outside the Rust regex grammar — lookaround, a backreference — that
 * the engine deliberately never supports, because supporting it would mean backtracking
 * (ADR-016); `tooComplex` is a pattern that compiles past the size limit this backend imposes.
 */
export class SearchPatternInvalidError extends DomainError {
  readonly code = 'SEARCH_PATTERN_INVALID';
  readonly messageKey = 'search.error.patternInvalid';

  constructor(reason: SearchPatternInvalidReason, position?: number) {
    super(`the pattern does not compile: ${reason}`, {
      reason,
      ...(position === undefined ? {} : { position }),
    });
  }
}
