import { describe, expect, it } from 'vitest';

import { SearchPatternInvalidError } from '@domain/search';

describe('SearchPatternInvalidError', () => {
  it('carries the reason, with no position when the engine gave none', () => {
    const error = new SearchPatternInvalidError('unsupported');

    expect(error.code).toBe('SEARCH_PATTERN_INVALID');
    expect(error.messageKey).toBe('search.error.patternInvalid');
    expect(error.params).toEqual({ reason: 'unsupported' });
  });

  it('carries the position the engine reported for a syntax error — S-27', () => {
    const error = new SearchPatternInvalidError('syntax', 5);

    expect(error.params).toEqual({ reason: 'syntax', position: 5 });
  });

  it('carries tooComplex with no position', () => {
    const error = new SearchPatternInvalidError('tooComplex');

    expect(error.params).toEqual({ reason: 'tooComplex' });
  });
});
