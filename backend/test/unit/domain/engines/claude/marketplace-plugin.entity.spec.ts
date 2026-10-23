import { describe, expect, it } from 'vitest';

import { effectivePluginState } from '@domain/engines/claude';

describe('effectivePluginState — plan 13, B-47, S-213', () => {
  it('passes the digest-based state through for a local plugin, regardless of the allowlist', () => {
    const local = { origin: 'local' as const, marketplace: null };

    expect(effectivePluginState(local, false, 'current')).toBe('current');
    expect(effectivePluginState(local, true, 'changed')).toBe('changed');
  });

  it('passes the digest-based state through for a marketplace plugin whose marketplace is still allowed', () => {
    const plugin = { origin: 'marketplace' as const, marketplace: 'acme' };

    expect(effectivePluginState(plugin, true, 'current')).toBe('current');
    expect(effectivePluginState(plugin, true, 'unreadable')).toBe('unreadable');
  });

  it('overrides to marketplaceNotAllowed when a marketplace plugin’s marketplace is no longer allowed', () => {
    const plugin = { origin: 'marketplace' as const, marketplace: 'acme' };

    expect(effectivePluginState(plugin, false, 'current')).toBe('marketplaceNotAllowed');
    expect(effectivePluginState(plugin, false, 'changed')).toBe('marketplaceNotAllowed');
    expect(effectivePluginState(plugin, false, 'unreadable')).toBe('marketplaceNotAllowed');
  });
});
