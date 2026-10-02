import { describe, expect, it } from 'vitest';

import {
  adjustForSave,
  convertIndentation,
  detectIndentation,
  ensureFinalNewline,
  formatBytes,
  offsetAt,
  positionAt,
  trimTrailingWhitespace,
  withEol,
} from '@/features/editor/lib/text';

describe('the save adjustments — plan 07, S-237', () => {
  it('trims the spaces and tabs at the end of each line, and nothing else', () => {
    expect(trimTrailingWhitespace('a  \n\tb\t\r\n  c d \t')).toBe('a\n\tb\r\n  c d');
    expect(trimTrailingWhitespace('keep  inner  spaces')).toBe('keep  inner  spaces');
  });

  it('ends the text with one line ending of its own kind, only when it has none', () => {
    expect(ensureFinalNewline('a', 'lf')).toBe('a\n');
    expect(ensureFinalNewline('a', 'crlf')).toBe('a\r\n');
    expect(ensureFinalNewline('a\n', 'crlf')).toBe('a\n');
    expect(ensureFinalNewline('', 'lf')).toBe('');
  });

  it('applies only the adjustments that are on', () => {
    const text = 'a \nb';

    expect(
      adjustForSave(text, 'lf', { trimTrailingWhitespace: false, insertFinalNewline: false }),
    ).toBe(text);
    expect(
      adjustForSave(text, 'lf', { trimTrailingWhitespace: true, insertFinalNewline: false }),
    ).toBe('a\nb');
    expect(
      adjustForSave(text, 'lf', { trimTrailingWhitespace: false, insertFinalNewline: true }),
    ).toBe('a \nb\n');
    expect(
      adjustForSave(text, 'lf', { trimTrailingWhitespace: true, insertFinalNewline: true }),
    ).toBe('a\nb\n');
  });
});

describe('line endings', () => {
  it('makes every ending one kind', () => {
    expect(withEol('a\r\nb\rc\nd', 'lf')).toBe('a\nb\nc\nd');
    expect(withEol('a\nb', 'crlf')).toBe('a\r\nb');
  });
});

describe('the indentation of a text', () => {
  it('is nothing when no line is indented — the preferences decide', () => {
    expect(detectIndentation('a\nb')).toBeNull();
  });

  it('is tabs when most indented lines start with one', () => {
    expect(detectIndentation('a\n\tb\n\tc\n  d')).toEqual({ insertSpaces: false, size: 4 });
  });

  it('is spaces sized by the smallest step, and four when the step is odd', () => {
    expect(detectIndentation('a\n  b\n    c')).toEqual({ insertSpaces: true, size: 2 });
    expect(detectIndentation('a\n   b')).toEqual({ insertSpaces: true, size: 4 });
  });

  it('converts tabs to spaces and spaces back to tabs, at the start of lines only — S-251', () => {
    expect(convertIndentation('\ta\t1\n\t\tb', true, 2)).toBe('  a\t1\n    b');
    expect(convertIndentation('    a  1\n      b', false, 4)).toBe('\ta  1\n\t  b');
  });
});

describe('positions in a text', () => {
  it('go from an offset to a line and a column, and back', () => {
    expect(positionAt('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
    expect(offsetAt('ab\ncd', { line: 2, column: 2 })).toBe(4);
  });

  it('are clamped into the text', () => {
    expect(offsetAt('ab\ncd', { line: 9, column: 9 })).toBe(5);
    expect(offsetAt('ab', { line: 0, column: 0 })).toBe(0);
    expect(positionAt('ab', -3)).toEqual({ line: 1, column: 1 });
  });
});

describe('a size for a person', () => {
  it('is in bytes, kilobytes or megabytes, in their language', () => {
    expect(formatBytes(512, 'en')).toMatch(/512\s?byte/);
    expect(formatBytes(1_500, 'en')).toMatch(/1\.5\s?kB/);
    expect(formatBytes(12_300_000, 'pt-BR')).toMatch(/12,3\s?MB/);
  });
});
