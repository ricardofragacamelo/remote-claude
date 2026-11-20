import { describe, expect, it } from 'vitest';

import { hasUnsupportedRegexFeature } from '@domain/search';

describe('hasUnsupportedRegexFeature — S-28', () => {
  it.each(['(?=lookahead)', '(?!negative)', '(?<=lookbehind)', '(?<!negative)'])(
    'flags lookaround: %s',
    (pattern) => {
      expect(hasUnsupportedRegexFeature(pattern)).toBe(true);
    },
  );

  it.each(['(a)\\1', String.raw`\k<name>`, String.raw`\k'name'`])(
    'flags a backreference: %s',
    (pattern) => {
      expect(hasUnsupportedRegexFeature(pattern)).toBe(true);
    },
  );

  it.each(['abc', '[a-z]+', '(group)', '\\d+', '\\bword\\b', '.*'])(
    'leaves an ordinary pattern alone: %s',
    (pattern) => {
      expect(hasUnsupportedRegexFeature(pattern)).toBe(false);
    },
  );
});
