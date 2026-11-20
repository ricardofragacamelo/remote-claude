import { describe, expect, it } from 'vitest';

import { quickOpenInputOf } from '@/features/search/lib/quick-open-query';

describe('quickOpenInputOf — plan 11, B-14, S-107', () => {
  it('reads a plain query as a search, with no line', () => {
    expect(quickOpenInputOf('readme')).toEqual({ kind: 'search', query: 'readme', line: null });
  });

  it('reads an empty query as a search too', () => {
    expect(quickOpenInputOf('')).toEqual({ kind: 'search', query: '', line: null });
  });

  it('splits "file.ts:42" into the file to search for and the line to open it at', () => {
    expect(quickOpenInputOf('src/app.ts:42')).toEqual({
      kind: 'search',
      query: 'src/app.ts',
      line: 42,
    });
  });

  it('forwards a bare ":42" to the editor’s own "go to line", never reimplementing it', () => {
    expect(quickOpenInputOf(':42')).toEqual({ kind: 'goToLine' });
  });

  it('forwards a bare ":" the same way, with nothing typed after it yet', () => {
    expect(quickOpenInputOf(':')).toEqual({ kind: 'goToLine' });
  });

  it('does not treat a trailing colon with no digits as a line', () => {
    expect(quickOpenInputOf('app.ts:')).toEqual({ kind: 'search', query: 'app.ts:', line: null });
  });
});
