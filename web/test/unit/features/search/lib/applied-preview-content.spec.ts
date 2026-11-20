import { describe, expect, it } from 'vitest';

import { appliedPreviewContent } from '@/features/search/lib/applied-preview-content';
import type { ReplacePreviewMatch } from '@/features/search/types/search';

function aMatch(line: number, column: number, endColumn: number, replacement: string) {
  return {
    line,
    column,
    endColumn,
    preview: '',
    previewMatchStart: 0,
    previewMatchEnd: 0,
    replacement,
  } satisfies ReplacePreviewMatch;
}

describe('appliedPreviewContent — plan 11, B-16', () => {
  it('splices one match into its own line, the rest of the file untouched', () => {
    const content = 'one TODO\ntwo\nthree';

    expect(appliedPreviewContent(content, [aMatch(1, 5, 9, 'DONE')])).toBe('one DONE\ntwo\nthree');
  });

  it('splices several matches on several lines, each read against the original text', () => {
    const content = 'TODO one\nTODO two\nTODO three';
    const matches = [aMatch(1, 1, 5, 'DONE'), aMatch(2, 1, 5, 'DONE'), aMatch(3, 1, 5, 'DONE')];

    expect(appliedPreviewContent(content, matches)).toBe('DONE one\nDONE two\nDONE three');
  });

  it('splices two matches on the same line without one shifting the other', () => {
    const content = 'TODO and TODO';

    expect(
      appliedPreviewContent(content, [aMatch(1, 1, 5, 'DONE'), aMatch(1, 10, 14, 'DONE')]),
    ).toBe('DONE and DONE');
  });

  it('answers the content as it is when there is no match at all', () => {
    expect(appliedPreviewContent('nothing here', [])).toBe('nothing here');
  });

  it('normalizes a CRLF file to LF, the same the backend does, before splicing', () => {
    const content = 'TODO one\r\nTODO two';

    expect(appliedPreviewContent(content, [aMatch(1, 1, 5, 'DONE')])).toBe('DONE one\nTODO two');
  });

  it('replaces matches out of line order the same as in order', () => {
    const content = 'TODO one\nTODO two';
    const outOfOrder = [aMatch(2, 1, 5, 'DONE'), aMatch(1, 1, 5, 'DONE')];

    expect(appliedPreviewContent(content, outOfOrder)).toBe('DONE one\nDONE two');
  });
});
