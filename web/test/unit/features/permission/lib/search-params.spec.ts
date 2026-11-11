import { describe, expect, it } from 'vitest';

import { oneOf, text } from '@/features/permission/lib/search-params';

describe('text — a non-blank string from the URL’s own search (shared by rules-search and new-rule-search)', () => {
  it('reads a non-blank string, trimmed', () => {
    expect(text('  git status  ')).toBe('git status');
  });

  it('is undefined for a blank or whitespace-only string', () => {
    expect(text('')).toBeUndefined();
    expect(text('   ')).toBeUndefined();
  });

  it('is undefined for anything that is not a string, never throwing', () => {
    expect(text(undefined)).toBeUndefined();
    expect(text(null)).toBeUndefined();
    expect(text(42)).toBeUndefined();
    expect(text(['a'])).toBeUndefined();
    expect(text({ a: 1 })).toBeUndefined();
  });
});

describe('oneOf — one of the allowed values, read from the URL’s own search', () => {
  const allowed = ['allow', 'deny'] as const;

  it('reads a value that is in the allowed set', () => {
    expect(oneOf('allow', allowed)).toBe('allow');
    expect(oneOf('deny', allowed)).toBe('deny');
  });

  it('falls back to undefined for a value outside the allowed set, never throwing', () => {
    expect(oneOf('maybe', allowed)).toBeUndefined();
  });

  it('falls back to undefined for anything that is not a string', () => {
    expect(oneOf(undefined, allowed)).toBeUndefined();
    expect(oneOf(null, allowed)).toBeUndefined();
    expect(oneOf(1, allowed)).toBeUndefined();
    expect(oneOf(['allow'], allowed)).toBeUndefined();
  });
});
