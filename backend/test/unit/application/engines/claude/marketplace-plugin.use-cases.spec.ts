import { describe, expect, it } from 'vitest';

import {
  AddMarketplacePluginUseCase,
  ApplyMarketplacePluginUpdateUseCase,
  CheckMarketplacePluginUpdateUseCase,
  ListMarketplacePluginsUseCase,
  ListMarketplacesUseCase,
  ListPluginsUseCase,
} from '@application/engines/claude';
import type {
  PluginDependencies,
  PluginRepository,
  StoredPlugin,
} from '@application/engines/claude';
import { RecordAuditEventUseCase } from '@application/audit';
import type { FolderAccess } from '@application/agent-settings';
import {
  digestOfPluginManifest,
  PluginForbiddenError,
  PluginMarketplaceNotAllowedError,
  PluginNotFoundError,
  PluginPathInvalidError,
  PluginSourceUnavailableError,
} from '@domain/engines/claude';
import type { PluginManifest } from '@domain/engines/claude';
import { UserId } from '@domain/auth';
import {
  declaredMarketplace,
  FakeMarketplaceAllowlist,
} from '../../../../support/fakes/fake-marketplace-allowlist';
import { FakeMarketplacePluginSource } from '../../../../support/fakes/fake-marketplace-plugin-source';
import { FakePluginManifestReader } from '../../../../support/fakes/fake-plugin-manifest-reader';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { InMemoryPluginRepository } from '../../../../support/fakes/in-memory-plugin.repository';
import { RecordingAuditEvents } from '../../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';

const ENGINE = 'claude';
const USER = UserId.create('auth|marketplace-owner');
const STRANGER = UserId.create('auth|marketplace-stranger');
const NOW = new Date('2026-10-22T12:00:00Z');
const MARKETPLACE_URL = 'https://example.invalid/acme.git';
const BASE_DIR = '/srv/plugin-downloads';

const MANIFEST: PluginManifest = {
  name: 'my-plugin',
  description: 'A marketplace plugin',
  version: '1.0.0',
  commands: ['deploy'],
  agents: [],
  hookCount: 0,
  skills: ['explain'],
  mcpServers: [],
};

function harness() {
  const plugins = new InMemoryPluginRepository();
  const manifests = new FakePluginManifestReader();
  const events = new RecordingAuditEvents();
  const clock = new FixedClock(NOW);
  const marketplaces = new FakeMarketplaceAllowlist([declaredMarketplace('acme', MARKETPLACE_URL)]);
  const source = new FakeMarketplacePluginSource();

  const folders: FolderAccess = {
    resolve: (raw) => Promise.reject(new Error(`unused in this suite: ${raw}`)),
    locate: (raw) => Promise.reject(new Error(`unused in this suite: ${raw}`)),
    firstRoot: () => Promise.reject(new Error('unused in this suite')),
  };

  const deps: PluginDependencies = {
    engine: ENGINE,
    plugins,
    manifests,
    folders,
    trail: new RecordAuditEventUseCase(events, new SequentialIds()),
    ids: new SequentialIds('plugin-'),
    clock,
    marketplaces,
    source,
    pluginDownloadDir: BASE_DIR,
  };

  return {
    deps,
    plugins,
    manifests,
    events,
    clock,
    marketplaces,
    source,
    list: new ListMarketplacesUseCase(deps),
    catalog: new ListMarketplacePluginsUseCase(deps),
    add: new AddMarketplacePluginUseCase(deps),
    checkUpdate: new CheckMarketplacePluginUpdateUseCase(deps),
    applyUpdate: new ApplyMarketplacePluginUpdateUseCase(deps),
    listPlugins: new ListPluginsUseCase(deps),
  };
}

describe('ListMarketplacesUseCase — plan 13, B-47, S-202', () => {
  it('answers the declared marketplaces, by name', () => {
    const { list } = harness();
    expect(list.execute()).toEqual([{ name: 'acme' }]);
  });

  it('answers nothing when none are declared — the feature is off', () => {
    const h = harness();
    h.marketplaces.set([]);
    expect(h.list.execute()).toEqual([]);
  });
});

describe('ListMarketplacePluginsUseCase — plan 13, B-47', () => {
  it('lists a declared marketplace’s own catalogue', async () => {
    const h = harness();
    h.source.setCatalog(MARKETPLACE_URL, [
      { name: 'one', description: 'first', supported: true },
      { name: 'two', description: null, supported: false },
    ]);

    const result = await h.catalog.execute('acme');

    expect(result).toEqual({
      name: 'acme',
      plugins: [
        { name: 'one', description: 'first', supported: true },
        { name: 'two', description: null, supported: false },
      ],
    });
  });

  it('refuses a marketplace the allowlist does not declare — S-201', async () => {
    const h = harness();
    await expect(h.catalog.execute('ghost')).rejects.toThrow(PluginMarketplaceNotAllowedError);
  });

  it('answers PLUGIN_SOURCE_UNAVAILABLE when the source cannot be read — S-203', async () => {
    const h = harness();
    // No catalog set for MARKETPLACE_URL — the fake answers `unavailable`.
    await expect(h.catalog.execute('acme')).rejects.toThrow(PluginSourceUnavailableError);
  });
});

describe('AddMarketplacePluginUseCase — plan 13, B-47, S-200, S-207, S-208, S-209, S-210', () => {
  it('installs a plugin from a declared marketplace and records engine.pluginAdded', async () => {
    const h = harness();
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd1' },
      'c0ffee',
    );

    const result = await h.add.execute(USER, 'acme', 'my-plugin');

    expect(result.origin).toBe('marketplace');
    expect(result.marketplace).toBe('acme');
    expect(result.commit).toBe('c0ffee');
    expect(result.name).toBe('my-plugin');
    expect(result.state).toBe('current');
    expect(result.manifest).toEqual(MANIFEST);
    expect(result.path.startsWith(BASE_DIR)).toBe(true);

    expect(h.source.committed).toHaveLength(1);
    expect(h.source.committed[0]?.destination).toBe(result.path);
    expect(h.events.kinds).toEqual(['engine.pluginAdded']);
    const details = h.events.appended[0]?.details as { engine: string; messageKey: string };
    expect(details.engine).toBe(ENGINE);
    expect(details.messageKey).toBe('engines.claude.plugin.descriptionMarketplace');
  });

  it('refuses a marketplace the allowlist does not declare — S-201', async () => {
    const h = harness();
    await expect(h.add.execute(USER, 'ghost', 'my-plugin')).rejects.toThrow(
      PluginMarketplaceNotAllowedError,
    );
    expect(await h.plugins.listFor(USER)).toEqual([]);
  });

  it('answers PLUGIN_SOURCE_UNAVAILABLE and writes nothing when the source cannot be fetched — S-203', async () => {
    const h = harness();
    await expect(h.add.execute(USER, 'acme', 'my-plugin')).rejects.toThrow(
      PluginSourceUnavailableError,
    );
    expect(await h.plugins.listFor(USER)).toEqual([]);
    expect(h.source.committed).toEqual([]);
  });

  it('answers PLUGIN_NOT_FOUND for a plugin the marketplace does not list', async () => {
    const h = harness();
    h.source.setCatalog(MARKETPLACE_URL, [{ name: 'other', description: null, supported: true }]);

    await expect(h.add.execute(USER, 'acme', 'nope')).rejects.toThrow(PluginNotFoundError);
  });

  it('answers PLUGIN_PATH_INVALID when the source itself reports an unsupported kind — S-204', async () => {
    const h = harness();
    h.source.failPrepare(MARKETPLACE_URL, 'my-plugin', {
      kind: 'pathInvalid',
      reason: 'the plugin source is not a supported kind',
    });

    await expect(h.add.execute(USER, 'acme', 'my-plugin')).rejects.toThrow(PluginPathInvalidError);
  });

  it('refuses an unsafe plugin name before ever reaching the source — S-204', async () => {
    const h = harness();
    await expect(h.add.execute(USER, 'acme', '../escape')).rejects.toThrow(PluginPathInvalidError);
    expect(h.source.committed).toEqual([]);
  });

  it('is idempotent: installing the same plugin again answers the existing row, no second download — S-207', async () => {
    const h = harness();
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd1' },
      'c0ffee',
    );

    const first = await h.add.execute(USER, 'acme', 'my-plugin');
    h.source.committed.length = 0; // clears the call log without replacing the array reference
    const second = await h.add.execute(USER, 'acme', 'my-plugin');

    expect(second.id).toBe(first.id);
    expect(h.source.committed).toEqual([]);
    expect(h.events.kinds).toEqual(['engine.pluginAdded']);
  });

  it('discards its own download and answers the winner’s row when insertIfAbsent loses the race — S-208', async () => {
    const h = harness();
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd1' },
      'c0ffee',
    );

    const winnerRow: StoredPlugin = {
      id: 'winner',
      userId: USER,
      origin: 'marketplace',
      path: '/srv/plugin-downloads/winner-path',
      marketplace: 'acme',
      commit: 'c0ffee',
      name: 'my-plugin',
      approvedDigest: 'd1',
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const racedRepository: PluginRepository = {
      findByPath: () => Promise.resolve(null), // nobody has it yet, from this call's point of view
      insertIfAbsent: () => Promise.resolve({ plugin: winnerRow, created: false }),
      listFor: (userId) => h.plugins.listFor(userId),
      findById: (id) => h.plugins.findById(id),
      insert: (id, write, now) => h.plugins.insert(id, write, now),
      setEnabled: (id, enabled, now) => h.plugins.setEnabled(id, enabled, now),
      updateInstalled: (id, fields, now) => h.plugins.updateInstalled(id, fields, now),
      delete: (id) => h.plugins.delete(id),
    };
    const raced = new AddMarketplacePluginUseCase({ ...h.deps, plugins: racedRepository });

    const result = await raced.execute(USER, 'acme', 'my-plugin');

    expect(result.id).toBe('winner');
    expect(h.source.committed).toEqual([]);
    expect(h.source.discarded).toEqual(['/fake-staged/1']);
    expect(h.events.kinds).toEqual([]);
  });

  it('rolls back the row and the directory when the trail cannot take the add — S-209', async () => {
    const h = harness();
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd1' },
      'c0ffee',
    );
    h.events.failure = new Error('trail unavailable');

    await expect(h.add.execute(USER, 'acme', 'my-plugin')).rejects.toThrow('trail unavailable');

    expect(await h.plugins.listFor(USER)).toEqual([]);
    expect(h.source.discarded).toHaveLength(1);
  });

  it('never lets one user’s install be found under another user’s lookup — S-210', async () => {
    const h = harness();
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd1' },
      'c0ffee',
    );
    await h.add.execute(USER, 'acme', 'my-plugin');

    expect(await h.plugins.listFor(STRANGER)).toEqual([]);
  });
});

describe('ListPluginsUseCase — a marketplace plugin, plan 13, B-47, S-206', () => {
  it('goes back to changed when the installed directory is edited outside the normal flow', async () => {
    const h = harness();
    // The real `GitMarketplacePluginSource.prepare()` always reads the digest from the very same
    // `PluginManifestReader` the install writes under — this fake keeps the two independent, so the
    // digest has to be the manifest's real one for "nothing changed yet" to mean `current`.
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: digestOfPluginManifest(MANIFEST) },
      'c0ffee',
    );
    const added = await h.add.execute(USER, 'acme', 'my-plugin');
    h.manifests.set(added.path, MANIFEST);

    const [current] = await h.listPlugins.execute(USER);
    expect(current?.state).toBe('current');

    // Something outside the normal install/update flow touched the installed directory directly.
    h.manifests.set(added.path, { ...MANIFEST, version: '9.9.9' });

    const [changed] = await h.listPlugins.execute(USER);
    expect(changed?.state).toBe('changed');
  });
});

describe('CheckMarketplacePluginUpdateUseCase — plan 13, B-47, S-205', () => {
  // The real `PluginManifestReader` reads whatever `commit`/`swap` actually moved onto disk; the
  // fakes keep those two filesystems separate, so a test that wants "the installed content, as it
  // reads right now" sets it explicitly, the same way the real one reads it fresh every time.
  async function installed(h: ReturnType<typeof harness>, commit = 'c0ffee'): Promise<string> {
    h.source.setPlugin(MARKETPLACE_URL, 'my-plugin', { manifest: MANIFEST, digest: 'd1' }, commit);
    const result = await h.add.execute(USER, 'acme', 'my-plugin');
    h.manifests.set(result.path, MANIFEST);
    return result.id;
  }

  it('answers no update for a local plugin', async () => {
    const h = harness();
    const id = await h.plugins
      .insert(
        'local-1',
        {
          userId: USER,
          identity: { origin: 'local', path: '/srv/x', marketplace: null, commit: null },
          name: 'local',
          approvedDigest: 'd',
        },
        NOW,
      )
      .then((row) => row.id);

    expect(await h.checkUpdate.execute(USER, id)).toEqual({
      available: false,
      newCommit: null,
      diff: null,
    });
  });

  it('answers no update when the resolved commit matches the installed one', async () => {
    const h = harness();
    const id = await installed(h, 'c0ffee');
    h.source.setCommit(MARKETPLACE_URL, 'c0ffee');

    expect(await h.checkUpdate.execute(USER, id)).toEqual({
      available: false,
      newCommit: 'c0ffee',
      diff: null,
    });
  });

  it('answers an update is available, with the diff of what it would bring', async () => {
    const h = harness();
    const id = await installed(h, 'c0ffee');
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: { ...MANIFEST, commands: ['deploy', 'rollback'] }, digest: 'd2' },
      'newcommit',
    );

    const check = await h.checkUpdate.execute(USER, id);

    expect(check.available).toBe(true);
    expect(check.newCommit).toBe('newcommit');
    expect(check.diff?.commandsAdded).toEqual(['rollback']);
    // A check never installs or discards the currently-running content.
    expect(h.source.committed).toHaveLength(1); // only the original install
  });

  it('answers no update when the marketplace can no longer be reached at all', async () => {
    const h = harness();
    const id = await installed(h, 'c0ffee');
    h.marketplaces.set([]); // also marketplaceNotAllowed, but the check still just answers "none"

    expect(await h.checkUpdate.execute(USER, id)).toEqual({
      available: false,
      newCommit: null,
      diff: null,
    });
  });

  it("refuses somebody else's plugin", async () => {
    const h = harness();
    const id = await installed(h);
    await expect(h.checkUpdate.execute(STRANGER, id)).rejects.toThrow(PluginForbiddenError);
  });

  it('answers no update when the source itself cannot be reached to resolve a commit', async () => {
    const h = harness();
    const id = await installed(h, 'c0ffee');
    h.source.failResolveCommit(MARKETPLACE_URL);

    expect(await h.checkUpdate.execute(USER, id)).toEqual({
      available: false,
      newCommit: null,
      diff: null,
    });
  });

  it('answers available with no diff when the commit moved but the new content cannot be fetched', async () => {
    const h = harness();
    const id = await installed(h, 'c0ffee');
    h.source.setCommit(MARKETPLACE_URL, 'newcommit');
    h.source.failPrepare(MARKETPLACE_URL, 'my-plugin');

    expect(await h.checkUpdate.execute(USER, id)).toEqual({
      available: true,
      newCommit: 'newcommit',
      diff: null,
    });
  });

  it('answers available with no diff when the currently-installed manifest cannot be read', async () => {
    const h = harness();
    // Installed without ever calling `h.manifests.set(...)` for its path — reads as `notFound`.
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd1' },
      'c0ffee',
    );
    const added = await h.add.execute(USER, 'acme', 'my-plugin');
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: { ...MANIFEST, commands: ['rollback'] }, digest: 'd2' },
      'newcommit',
    );

    const check = await h.checkUpdate.execute(USER, added.id);

    expect(check).toEqual({ available: true, newCommit: 'newcommit', diff: null });
  });
});

describe('ApplyMarketplacePluginUpdateUseCase — plan 13, B-47, S-205, S-209', () => {
  async function installed(h: ReturnType<typeof harness>): Promise<string> {
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd1' },
      'c0ffee',
    );
    const result = await h.add.execute(USER, 'acme', 'my-plugin');
    h.manifests.set(result.path, MANIFEST);
    return result.id;
  }

  it('swaps to the new commit only after the trail accepts engine.pluginUpdated', async () => {
    const h = harness();
    const id = await installed(h);
    const newManifest: PluginManifest = { ...MANIFEST, commands: ['deploy', 'rollback'] };
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: newManifest, digest: 'd2' },
      'new-commit',
    );

    const result = await h.applyUpdate.execute(USER, id);

    expect(result.commit).toBe('new-commit');
    expect(result.manifest).toEqual(newManifest);
    expect(h.events.kinds).toEqual(['engine.pluginAdded', 'engine.pluginUpdated']);
    expect(h.source.swapped).toHaveLength(1);

    const stored = await h.plugins.findById(id);
    expect(stored?.commit).toBe('new-commit');
    expect(stored?.approvedDigest).toBe('d2');

    const details = h.events.appended[1]?.details as {
      messageKey: string;
      params: { commandsAddedNames: string; fromCommit: string; toCommit: string };
    };
    expect(details.messageKey).toBe('engines.claude.plugin.descriptionUpdate');
    expect(details.params.commandsAddedNames).toBe('rollback');
    expect(details.params.fromCommit).toBe('c0ffee');
    expect(details.params.toCommit).toBe('new-commit');
  });

  it('still updates when the currently-installed manifest can no longer be read (fallback diff)', async () => {
    const h = harness();
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd1' },
      'c0ffee',
    );
    const installedResult = await h.add.execute(USER, 'acme', 'my-plugin');
    // No `h.manifests.set(...)` this time — the installed path reads as `notFound`.
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd2' },
      'new-commit',
    );

    const result = await h.applyUpdate.execute(USER, installedResult.id);

    expect(result.commit).toBe('new-commit');
  });

  it('never swaps when the trail cannot take engine.pluginUpdated', async () => {
    const h = harness();
    const id = await installed(h);
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: { ...MANIFEST, commands: ['rollback'] }, digest: 'd2' },
      'new-commit',
    );
    h.events.failure = new Error('trail unavailable');

    await expect(h.applyUpdate.execute(USER, id)).rejects.toThrow('trail unavailable');

    expect(h.source.swapped).toEqual([]);
    const stored = await h.plugins.findById(id);
    expect(stored?.commit).toBe('c0ffee');
  });

  it('refuses to update a local plugin', async () => {
    const h = harness();
    const row = await h.plugins.insert(
      'local-1',
      {
        userId: USER,
        identity: { origin: 'local', path: '/srv/x', marketplace: null, commit: null },
        name: 'local',
        approvedDigest: 'd',
      },
      NOW,
    );

    await expect(h.applyUpdate.execute(USER, row.id)).rejects.toThrow(PluginPathInvalidError);
  });

  it('refuses to update once the plugin’s marketplace is no longer declared', async () => {
    const h = harness();
    const id = await installed(h);
    h.marketplaces.set([]);

    await expect(h.applyUpdate.execute(USER, id)).rejects.toThrow(PluginMarketplaceNotAllowedError);
  });

  it("refuses somebody else's plugin", async () => {
    const h = harness();
    const id = await installed(h);
    await expect(h.applyUpdate.execute(STRANGER, id)).rejects.toThrow(PluginForbiddenError);
  });

  it('propagates the failure when the new content cannot be fetched at apply time', async () => {
    const h = harness();
    const id = await installed(h);
    h.source.failPrepare(MARKETPLACE_URL, 'my-plugin');

    await expect(h.applyUpdate.execute(USER, id)).rejects.toThrow(PluginSourceUnavailableError);
    expect(h.source.swapped).toEqual([]);
  });

  it('falls back to an empty fromCommit when the installed row carries none — defensive branch', async () => {
    const h = harness();
    const row = await h.plugins.insert(
      'mp-no-commit',
      {
        userId: USER,
        identity: {
          origin: 'marketplace',
          path: '/srv/plugins/u1/acme/my-plugin',
          marketplace: 'acme',
          commit: null,
        },
        name: 'my-plugin',
        approvedDigest: 'd0',
      },
      NOW,
    );
    h.source.setPlugin(
      MARKETPLACE_URL,
      'my-plugin',
      { manifest: MANIFEST, digest: 'd1' },
      'c0ffee',
    );

    const result = await h.applyUpdate.execute(USER, row.id);

    expect(result.commit).toBe('c0ffee');
  });
});
