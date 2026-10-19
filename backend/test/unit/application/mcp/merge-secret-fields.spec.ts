import { describe, expect, it } from 'vitest';

import { mergeSecretFields } from '@application/mcp';

describe('mergeSecretFields — plan 13, B-19, S-71', () => {
  it('keeps the existing value when a name is present with value omitted', () => {
    const existing = [{ name: 'TOKEN', value: 'old-value' }];
    const merged = mergeSecretFields(existing, [{ name: 'TOKEN' }]);
    expect(merged).toEqual([{ name: 'TOKEN', value: 'old-value' }]);
  });

  it('removes the name when value is explicitly null', () => {
    const existing = [{ name: 'TOKEN', value: 'old-value' }];
    const merged = mergeSecretFields(existing, [{ name: 'TOKEN', value: null }]);
    expect(merged).toEqual([]);
  });

  it('replaces the value when a string is given', () => {
    const existing = [{ name: 'TOKEN', value: 'old-value' }];
    const merged = mergeSecretFields(existing, [{ name: 'TOKEN', value: 'new-value' }]);
    expect(merged).toEqual([{ name: 'TOKEN', value: 'new-value' }]);
  });

  it('uses an empty string when a name is new and its value is omitted — nothing to keep', () => {
    const merged = mergeSecretFields([], [{ name: 'FRESH' }]);
    expect(merged).toEqual([{ name: 'FRESH', value: '' }]);
  });

  it('returns nothing proposed at all as an empty list — a create with no secrets', () => {
    expect(mergeSecretFields([{ name: 'TOKEN', value: 'x' }], undefined)).toEqual([]);
  });

  it('leaves an existing name out entirely when the proposal never mentions it', () => {
    const existing = [
      { name: 'KEEP_ME', value: 'kept' },
      { name: 'DROP_ME', value: 'dropped' },
    ];
    const merged = mergeSecretFields(existing, [{ name: 'KEEP_ME' }]);
    expect(merged).toEqual([{ name: 'KEEP_ME', value: 'kept' }]);
  });

  it('applies the three rules together, in one call', () => {
    const existing = [
      { name: 'KEPT', value: 'old' },
      { name: 'REMOVED', value: 'gone-soon' },
    ];
    const merged = mergeSecretFields(existing, [
      { name: 'KEPT' },
      { name: 'REMOVED', value: null },
      { name: 'REPLACED', value: 'new' },
    ]);
    expect(merged).toEqual([
      { name: 'KEPT', value: 'old' },
      { name: 'REPLACED', value: 'new' },
    ]);
  });
});
