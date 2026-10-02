import { describe, expect, it } from 'vitest';

import { MAX_NAME_BYTES, NAME_PROBLEM_KEYS, nameProblem } from '@/features/explorer/lib/names';

const none = (): boolean => false;

describe('a name typed in place — S-171', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['.', 'reserved'],
    ['..', 'reserved'],
    ['a/b', 'separator'],
    ['a\\b', 'separator'],
    ['a\u0000b', 'control'],
    ['tab\there', 'control'],
    ['del\u007f', 'control'],
    ['x'.repeat(MAX_NAME_BYTES + 1), 'tooLong'],
    ['é'.repeat(128), 'tooLong'],
  ])('refuses %j as %s', (name, problem) => {
    expect(nameProblem(name, none)).toBe(problem);
  });

  it('refuses a name the folder has, and takes any other', () => {
    expect(nameProblem('a.ts', (name) => name === 'a.ts')).toBe('exists');
    expect(nameProblem('b.ts', (name) => name === 'a.ts')).toBeNull();
    expect(nameProblem('x'.repeat(MAX_NAME_BYTES), none)).toBeNull();
    expect(nameProblem(' spaced name ', none)).toBeNull();
  });

  it('says each problem by a key of its own', () => {
    expect(new Set(Object.values(NAME_PROBLEM_KEYS)).size).toBe(6);
  });
});
