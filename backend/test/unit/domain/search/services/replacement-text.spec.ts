import { describe, expect, it } from 'vitest';

import {
  hasUnsupportedGroupReference,
  resolvedReplacementOf,
} from '@domain/search/services/replacement-text';

describe('hasUnsupportedGroupReference', () => {
  it('is false for a replacement with no $ at all — eq', () => {
    expect(hasUnsupportedGroupReference('literal text', true)).toBe(false);
  });

  it('is false for $0 and ${0}, the whole match — eq', () => {
    expect(hasUnsupportedGroupReference('[$0]', true)).toBe(false);
    expect(hasUnsupportedGroupReference('[${0}]', true)).toBe(false);
  });

  it('is false for the $$ escape, never a group reference — eq', () => {
    expect(hasUnsupportedGroupReference('costs $$5', true)).toBe(false);
  });

  it('is true for a numbered group, bare or braced — err', () => {
    expect(hasUnsupportedGroupReference('$1', true)).toBe(true);
    expect(hasUnsupportedGroupReference('${12}', true)).toBe(true);
  });

  it('is true for a named group, bare or braced — err', () => {
    expect(hasUnsupportedGroupReference('$foo', true)).toBe(true);
    expect(hasUnsupportedGroupReference('${foo}', true)).toBe(true);
  });

  it('is true for a group reference anywhere in a longer string — fron', () => {
    expect(hasUnsupportedGroupReference('prefix-$1-suffix', true)).toBe(true);
  });

  it('is always false when the pattern is literal — no capture group can exist (S-82, S-96)', () => {
    expect(hasUnsupportedGroupReference('$1', false)).toBe(false);
    expect(hasUnsupportedGroupReference('${foo}', false)).toBe(false);
  });

  it('is false for a lone trailing $ with nothing after it — fron', () => {
    expect(hasUnsupportedGroupReference('price: $', true)).toBe(false);
  });
});

describe('resolvedReplacementOf', () => {
  it('leaves a replacement with no $ exactly as typed — eq, S-96', () => {
    expect(resolvedReplacementOf('-rf; $(rm -rf /)', 'needle')).toBe('-rf; $(rm -rf /)');
  });

  it('resolves $0 and ${0} to the whole matched text — eq', () => {
    expect(resolvedReplacementOf('[$0]', 'needle')).toBe('[needle]');
    expect(resolvedReplacementOf('[${0}]', 'needle')).toBe('[needle]');
  });

  it('resolves $$ to a literal $, never a group reference — eq', () => {
    expect(resolvedReplacementOf('costs $$5', 'needle')).toBe('costs $5');
  });

  it('resolves a group reference to empty — the literal-pattern fallback (S-82, S-96)', () => {
    expect(resolvedReplacementOf('[$1]', 'needle')).toBe('[]');
    expect(resolvedReplacementOf('[${foo}]', 'needle')).toBe('[]');
  });

  it('resolves more than one reference in the same string — fron', () => {
    expect(resolvedReplacementOf('$0-$0', 'ab')).toBe('ab-ab');
  });

  it('is idempotent — resolving the same inputs twice gives the same text', () => {
    const once = resolvedReplacementOf('[$0]', 'needle');
    const twice = resolvedReplacementOf('[$0]', 'needle');
    expect(once).toBe(twice);
  });

  it('leaves a lone trailing $ untouched', () => {
    expect(resolvedReplacementOf('price: $', 'needle')).toBe('price: $');
  });
});
