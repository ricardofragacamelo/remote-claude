import { describe, expect, it } from 'vitest';

import { appliedContentOf, appliedLineOf } from '@domain/search/services/applied-content';

describe('appliedLineOf', () => {
  it('replaces a single match with a literal replacement — eq', () => {
    const line = 'hello needle world';
    const submatches = [{ startByte: 6, endByte: 12, text: 'needle' }];

    expect(appliedLineOf(line, submatches, 'found', false)).toBe('hello found world');
  });

  it('replaces two matches on the same line, back to front, without shifting the first — fron', () => {
    const line = 'needle and needle again';
    const submatches = [
      { startByte: 0, endByte: 6, text: 'needle' },
      { startByte: 11, endByte: 17, text: 'needle' },
    ];

    expect(appliedLineOf(line, submatches, 'found', false)).toBe('found and found again');
  });

  it('resolves $0 to the matched text — eq, B-11', () => {
    const line = 'hello needle world';
    const submatches = [{ startByte: 6, endByte: 12, text: 'needle' }];

    expect(appliedLineOf(line, submatches, '[$0]', false)).toBe('hello [needle] world');
  });

  it('preserves case when asked — S-97', () => {
    const line = 'Needle here';
    const submatches = [{ startByte: 0, endByte: 6, text: 'Needle' }];

    expect(appliedLineOf(line, submatches, 'found', true)).toBe('Found here');
  });

  it('leaves the match case alone when preserveCase is off', () => {
    const line = 'NEEDLE here';
    const submatches = [{ startByte: 0, endByte: 6, text: 'NEEDLE' }];

    expect(appliedLineOf(line, submatches, 'found', false)).toBe('found here');
  });

  it('places the column correctly past a multibyte character — fron, S-65 parity', () => {
    const line = 'wörld foo';
    const byteOffsetOfFoo = Buffer.byteLength('wörld ', 'utf8');
    const submatches = [{ startByte: byteOffsetOfFoo, endByte: byteOffsetOfFoo + 3, text: 'foo' }];

    expect(appliedLineOf(line, submatches, 'bar', false)).toBe('wörld bar');
  });

  it('is a no-op for a line with no submatches', () => {
    expect(appliedLineOf('untouched', [], 'x', false)).toBe('untouched');
  });
});

describe('appliedContentOf', () => {
  it('replaces only the matched lines, the rest untouched byte for byte — eq', () => {
    const content = 'before\nneedle here\nafter\n';
    const matchedLines = [
      {
        lineNumber: 2,
        submatches: [{ startByte: 0, endByte: 6, text: 'needle' }],
      },
    ];

    expect(appliedContentOf(content, matchedLines, 'found', false)).toBe(
      'before\nfound here\nafter\n',
    );
  });

  it('preserves CRLF line endings — the \\r stays exactly where it was (S-90)', () => {
    const content = 'before\r\nneedle here\r\nafter\r\n';
    const matchedLines = [
      {
        lineNumber: 2,
        submatches: [{ startByte: 0, endByte: 6, text: 'needle' }],
      },
    ];

    expect(appliedContentOf(content, matchedLines, 'found', false)).toBe(
      'before\r\nfound here\r\nafter\r\n',
    );
  });

  it('replaces matches on more than one line in the same file', () => {
    const content = 'needle one\nuntouched\nneedle two\n';
    const matchedLines = [
      { lineNumber: 1, submatches: [{ startByte: 0, endByte: 6, text: 'needle' }] },
      { lineNumber: 3, submatches: [{ startByte: 0, endByte: 6, text: 'needle' }] },
    ];

    expect(appliedContentOf(content, matchedLines, 'found', false)).toBe(
      'found one\nuntouched\nfound two\n',
    );
  });

  it('is a no-op when no line of the file matched', () => {
    const content = 'a\nb\nc\n';

    expect(appliedContentOf(content, [], 'x', false)).toBe(content);
  });

  it('handles a file with no trailing newline at all', () => {
    const content = 'needle here';
    const matchedLines = [
      { lineNumber: 1, submatches: [{ startByte: 0, endByte: 6, text: 'needle' }] },
    ];

    expect(appliedContentOf(content, matchedLines, 'found', false)).toBe('found here');
  });
});
