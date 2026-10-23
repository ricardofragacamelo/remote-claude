import { describe, expect, it } from 'vitest';

import { isSafePathSegment, marketplacePluginDestination } from '@application/engines/claude';
import { UserId } from '@domain/auth';

describe('isSafePathSegment — plan 13, B-47, S-204', () => {
  it.each(['my-plugin', 'plugin_1', 'a', 'A1-b_2'])('accepts %s', (value) => {
    expect(isSafePathSegment(value)).toBe(true);
  });

  it.each(['', '.', '..', 'a/b', 'a\\b', 'a\0b', 'x'.repeat(129)])('refuses %j', (value) => {
    expect(isSafePathSegment(value)).toBe(false);
  });
});

describe('marketplacePluginDestination — plan 13, B-47, S-207, S-208', () => {
  const USER = UserId.create('auth|42');

  it('is deterministic: the same inputs always name the same directory', () => {
    const a = marketplacePluginDestination('/srv/plugins', USER, 'acme', 'my-plugin');
    const b = marketplacePluginDestination('/srv/plugins', USER, 'acme', 'my-plugin');
    expect(a).toBe(b);
  });

  it('differs by user, by marketplace and by plugin name', () => {
    const base = marketplacePluginDestination('/srv/plugins', USER, 'acme', 'my-plugin');
    const otherUser = marketplacePluginDestination(
      '/srv/plugins',
      UserId.create('auth|43'),
      'acme',
      'my-plugin',
    );
    const otherMarketplace = marketplacePluginDestination(
      '/srv/plugins',
      USER,
      'other',
      'my-plugin',
    );
    const otherPlugin = marketplacePluginDestination('/srv/plugins', USER, 'acme', 'other-plugin');

    expect(otherUser).not.toBe(base);
    expect(otherMarketplace).not.toBe(base);
    expect(otherPlugin).not.toBe(base);
  });

  it('never exposes the raw subject claim in the path', () => {
    const destination = marketplacePluginDestination('/srv/plugins', USER, 'acme', 'my-plugin');
    expect(destination).not.toContain('auth|42');
  });

  it('is rooted under the given base directory', () => {
    const destination = marketplacePluginDestination('/srv/plugins', USER, 'acme', 'my-plugin');
    expect(destination.startsWith('/srv/plugins/')).toBe(true);
    expect(destination.endsWith('/acme/my-plugin')).toBe(true);
  });
});
