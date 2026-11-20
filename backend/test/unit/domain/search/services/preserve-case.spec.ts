import { describe, expect, it } from 'vitest';

import { preserveCase } from '@domain/search';

describe('preserveCase — S-43', () => {
  it('lowers the replacement when the match is all lowercase', () => {
    expect(preserveCase('foo', 'bar')).toBe('bar');
  });

  it('title-cases the replacement when the match is title case', () => {
    expect(preserveCase('Foo', 'bar')).toBe('Bar');
  });

  it('uppers the replacement when the match is all uppercase', () => {
    expect(preserveCase('FOO', 'bar')).toBe('BAR');
  });

  it('leaves the replacement exactly as typed when the match is mixed case', () => {
    expect(preserveCase('FoO', 'bar')).toBe('bar');
  });

  it('leaves the replacement as typed when the match has no letters at all', () => {
    expect(preserveCase('123', 'bar')).toBe('bar');
  });

  it('does not crash on an empty replacement', () => {
    expect(preserveCase('Foo', '')).toBe('');
    expect(preserveCase('FOO', '')).toBe('');
  });

  it('title-cases a multi-character replacement, lowering the rest', () => {
    expect(preserveCase('Foo', 'BAZ')).toBe('Baz');
  });
});
