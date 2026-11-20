import { describe, expect, it } from 'vitest';

import { utf16ColumnOf } from '@domain/search';

describe('utf16ColumnOf — S-65', () => {
  it('answers the same column as the byte offset for pure ASCII', () => {
    const line = Buffer.from('hello world', 'utf8');

    expect(utf16ColumnOf(line, 6)).toBe(6);
  });

  it('answers a smaller column once a multibyte character precedes the match', () => {
    // "wörld": ö is 2 bytes in UTF-8, 1 UTF-16 unit.
    const line = Buffer.from('wörld foo', 'utf8');
    const byteOffsetOfFoo = Buffer.from('wörld ', 'utf8').length;

    expect(utf16ColumnOf(line, byteOffsetOfFoo)).toBe('wörld '.length);
    expect(byteOffsetOfFoo).toBe('wörld '.length + 1);
  });

  it('counts an astral character (emoji) as two UTF-16 units, not one', () => {
    // 😀 is 4 bytes in UTF-8, and a surrogate pair (2 UTF-16 units) in JS strings.
    const line = Buffer.from('😀 foo', 'utf8');
    const byteOffsetOfFoo = Buffer.from('😀 ', 'utf8').length;

    expect(utf16ColumnOf(line, byteOffsetOfFoo)).toBe('😀 '.length);
    expect('😀 '.length).toBe(3); // 2 (surrogate pair) + 1 (space)
  });

  it('answers 0 at the start of the line', () => {
    expect(utf16ColumnOf(Buffer.from('abc', 'utf8'), 0)).toBe(0);
  });
});
