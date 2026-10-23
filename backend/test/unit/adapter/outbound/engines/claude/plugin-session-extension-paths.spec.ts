import { describe, expect, it } from 'vitest';

import { ClaudePluginSessionExtensionPaths } from '@adapter/outbound/engines/claude/plugin-session-extension-paths';
import { UserId } from '@domain/auth';
import {
  declaredMarketplace,
  FakeMarketplaceAllowlist,
} from '../../../../../support/fakes/fake-marketplace-allowlist';
import { InMemoryPluginRepository } from '../../../../../support/fakes/in-memory-plugin.repository';

const USER = UserId.create('auth|plugin-session');
const NOW = new Date('2026-10-20T12:00:00Z');

describe('ClaudePluginSessionExtensionPaths — plan 13, B-27, S-123', () => {
  it('answers only the enabled plugins’ paths of the caller', async () => {
    const plugins = new InMemoryPluginRepository();
    await plugins.insert(
      'p1',
      {
        userId: USER,
        identity: { origin: 'local', path: '/one', marketplace: null, commit: null },
        name: 'one',
        approvedDigest: 'd1',
      },
      NOW,
    );
    const disabled = await plugins.insert(
      'p2',
      {
        userId: USER,
        identity: { origin: 'local', path: '/two', marketplace: null, commit: null },
        name: 'two',
        approvedDigest: 'd2',
      },
      NOW,
    );
    await plugins.setEnabled(disabled.id, false, NOW);

    const source = new ClaudePluginSessionExtensionPaths(plugins, new FakeMarketplaceAllowlist());
    const paths = await source.pathsFor({ userId: USER, engine: 'claude' });

    expect(paths).toEqual(['/one']);
  });

  it('answers nothing for an engine other than claude', async () => {
    const plugins = new InMemoryPluginRepository();
    await plugins.insert(
      'p1',
      {
        userId: USER,
        identity: { origin: 'local', path: '/one', marketplace: null, commit: null },
        name: 'one',
        approvedDigest: 'd1',
      },
      NOW,
    );

    const source = new ClaudePluginSessionExtensionPaths(plugins, new FakeMarketplaceAllowlist());
    expect(await source.pathsFor({ userId: USER, engine: 'codex' })).toEqual([]);
  });

  it('answers nothing when the caller has no plugins at all', async () => {
    const source = new ClaudePluginSessionExtensionPaths(
      new InMemoryPluginRepository(),
      new FakeMarketplaceAllowlist(),
    );
    expect(await source.pathsFor({ userId: USER, engine: 'claude' })).toEqual([]);
  });

  describe('marketplace plugins — plan 13, B-47, S-213', () => {
    it('includes an enabled marketplace plugin whose marketplace is still declared', async () => {
      const plugins = new InMemoryPluginRepository();
      await plugins.insert(
        'p1',
        {
          userId: USER,
          identity: { origin: 'marketplace', path: '/mp/one', marketplace: 'acme', commit: 'c1' },
          name: 'one',
          approvedDigest: 'd1',
        },
        NOW,
      );
      const marketplaces = new FakeMarketplaceAllowlist([declaredMarketplace('acme')]);

      const source = new ClaudePluginSessionExtensionPaths(plugins, marketplaces);
      expect(await source.pathsFor({ userId: USER, engine: 'claude' })).toEqual(['/mp/one']);
    });

    it('leaves out an enabled marketplace plugin once its marketplace is no longer declared', async () => {
      const plugins = new InMemoryPluginRepository();
      await plugins.insert(
        'p1',
        {
          userId: USER,
          identity: { origin: 'marketplace', path: '/mp/one', marketplace: 'acme', commit: 'c1' },
          name: 'one',
          approvedDigest: 'd1',
        },
        NOW,
      );
      const marketplaces = new FakeMarketplaceAllowlist([declaredMarketplace('acme')]);
      const source = new ClaudePluginSessionExtensionPaths(plugins, marketplaces);

      marketplaces.set([]); // the same effect a SIGHUP reload has on the allowlist in memory

      expect(await source.pathsFor({ userId: USER, engine: 'claude' })).toEqual([]);
    });
  });
});
