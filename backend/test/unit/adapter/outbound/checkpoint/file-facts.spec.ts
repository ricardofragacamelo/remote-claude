import { describe, expect, it } from 'vitest';

import { digestOf, isAbsent } from '@adapter/outbound/checkpoint/file-facts';

describe('the facts the undo compares by', () => {
  it('hashes contents with SHA-256, in hex', () => {
    expect(digestOf(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it.each([
    ['ENOENT', true],
    ['ENOTDIR', true],
    ['EACCES', false],
    ['EISDIR', false],
  ])('reads %s as nothing there: %s', (code, expected) => {
    expect(isAbsent(Object.assign(new Error(code), { code }))).toBe(expected);
  });

  it('reads a failure without a code, or no failure at all, as not knowing', () => {
    expect(isAbsent(new Error('no code'))).toBe(false);
    expect(isAbsent(null)).toBe(false);
  });
});
