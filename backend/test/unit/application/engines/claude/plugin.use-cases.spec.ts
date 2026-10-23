import { describe, expect, it } from 'vitest';

import {
  AddLocalPluginUseCase,
  ListPluginsUseCase,
  PreviewLocalPluginUseCase,
  RemovePluginUseCase,
  SetPluginEnabledUseCase,
} from '@application/engines/claude';
import type { PluginDependencies } from '@application/engines/claude';
import type { FolderAccess } from '@application/agent-settings';
import { RecordAuditEventUseCase } from '@application/audit';
import {
  PluginForbiddenError,
  PluginNotFoundError,
  PluginPathInvalidError,
} from '@domain/engines/claude';
import type { PluginManifest } from '@domain/engines/claude';
import { UserId } from '@domain/auth';
import {
  WorkspaceForbiddenError,
  WorkspaceNotAllowedError,
  WorkspacePath,
} from '@domain/workspace';
import { FakePluginManifestReader } from '../../../../support/fakes/fake-plugin-manifest-reader';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { InMemoryPluginRepository } from '../../../../support/fakes/in-memory-plugin.repository';
import { RecordingAuditEvents } from '../../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';

const ENGINE = 'claude';
const USER = UserId.create('auth|plugin-owner');
const STRANGER = UserId.create('auth|plugin-stranger');
const ROOT = '/srv/projects';
const PLUGIN_DIR = '/srv/projects/my-plugin';
const NOW = new Date('2026-10-20T12:00:00Z');

const MANIFEST: PluginManifest = {
  name: 'my-plugin',
  description: 'A plugin for tests',
  version: '1.0.0',
  commands: ['deploy'],
  agents: ['reviewer'],
  hookCount: 1,
  skills: ['explain'],
  mcpServers: [
    {
      name: 'docs',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server-docs'],
      url: null,
      env: [],
      headers: [],
    },
  ],
};

const CHANGED_MANIFEST: PluginManifest = { ...MANIFEST, version: '2.0.0' };

function harness() {
  const plugins = new InMemoryPluginRepository();
  const manifests = new FakePluginManifestReader();
  const events = new RecordingAuditEvents();
  const clock = new FixedClock(NOW);

  const folders: FolderAccess = {
    resolve: (raw, userId) =>
      raw.startsWith(ROOT) && userId.value === USER.value
        ? Promise.resolve(WorkspacePath.create(raw))
        : raw.startsWith(ROOT)
          ? Promise.reject(new WorkspaceForbiddenError(raw))
          : Promise.reject(new WorkspaceNotAllowedError(raw)),
    locate: async (raw, userId) => ({ folder: await folders.resolve(raw, userId), root: ROOT }),
    firstRoot: () => Promise.resolve(WorkspacePath.create(ROOT)),
  };

  const deps: PluginDependencies = {
    engine: ENGINE,
    plugins,
    manifests,
    folders,
    trail: new RecordAuditEventUseCase(events, new SequentialIds()),
    ids: new SequentialIds('plugin-'),
    clock,
  };

  return {
    plugins,
    manifests,
    events,
    clock,
    list: new ListPluginsUseCase(deps),
    preview: new PreviewLocalPluginUseCase(deps),
    add: new AddLocalPluginUseCase(deps),
    setEnabled: new SetPluginEnabledUseCase(deps),
    remove: new RemovePluginUseCase(deps),
  };
}

describe('Plugin use cases — plan 13, B-27', () => {
  describe('PreviewLocalPluginUseCase — S-124, S-125', () => {
    it('describes what a local directory brings, before anything is written', async () => {
      const { preview, manifests } = harness();
      manifests.set(PLUGIN_DIR, MANIFEST);

      const result = await preview.execute(USER, PLUGIN_DIR);

      expect(result.manifest).toEqual(MANIFEST);
      expect(result.description.messageKey).toBe('engines.claude.plugin.descriptionLocal');
      expect(result.description.params).toMatchObject({
        name: 'my-plugin',
        path: PLUGIN_DIR,
        commandCount: 1,
        agentCount: 1,
        hasHooks: true,
        skillCount: 1,
        mcpServerCount: 1,
        mcpServerNames: 'docs',
      });
    });

    it('refuses a directory with no manifest — S-124', async () => {
      const { preview } = harness();
      await expect(preview.execute(USER, PLUGIN_DIR)).rejects.toThrow(PluginPathInvalidError);
    });

    it('refuses a manifest that does not parse — S-124', async () => {
      const { preview, manifests } = harness();
      manifests.set(PLUGIN_DIR, 'malformed');
      await expect(preview.execute(USER, PLUGIN_DIR)).rejects.toThrow(PluginPathInvalidError);
    });

    it('refuses a path outside the allowlist — S-124', async () => {
      const { preview } = harness();
      await expect(preview.execute(USER, '/not-allowed')).rejects.toThrow(WorkspaceNotAllowedError);
    });

    it("refuses a path inside somebody else's root — S-124", async () => {
      const { preview } = harness();
      await expect(preview.execute(STRANGER, PLUGIN_DIR)).rejects.toThrow(WorkspaceForbiddenError);
    });
  });

  describe('AddLocalPluginUseCase — S-123, S-127, S-130', () => {
    it('adds a plugin and records engine.pluginAdded with the engine in the payload, before the response', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);

      const stored = await h.add.execute(USER, PLUGIN_DIR);

      expect(stored.origin).toBe('local');
      expect(stored.path).toBe(PLUGIN_DIR);
      expect(stored.name).toBe('my-plugin');
      expect(stored.enabled).toBe(true);
      expect(stored.state).toBe('current');
      expect(stored.manifest).toEqual(MANIFEST);

      expect(h.events.kinds).toEqual(['engine.pluginAdded']);
      const details = h.events.appended[0]?.details as {
        engine: string;
        messageKey: string;
        params: { name: string };
      };
      expect(details.engine).toBe(ENGINE);
      expect(details.messageKey).toBe('engines.claude.plugin.descriptionLocal');
      expect(details.params.name).toBe('my-plugin');
    });

    it('adding the same directory twice answers the existing plugin, with no second event — S-130', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);

      const first = await h.add.execute(USER, PLUGIN_DIR);
      const second = await h.add.execute(USER, PLUGIN_DIR);

      expect(second.id).toBe(first.id);
      expect(h.events.kinds).toEqual(['engine.pluginAdded']);
    });

    it('refuses a directory with no manifest — S-124', async () => {
      const h = harness();
      await expect(h.add.execute(USER, PLUGIN_DIR)).rejects.toThrow(PluginPathInvalidError);
      expect(await h.plugins.listFor(USER)).toEqual([]);
    });

    it('rolls back the row when the trail cannot take the add (fail closed)', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      h.events.failure = new Error('trail unavailable');

      await expect(h.add.execute(USER, PLUGIN_DIR)).rejects.toThrow('trail unavailable');
      expect(await h.plugins.listFor(USER)).toEqual([]);
    });
  });

  describe('SetPluginEnabledUseCase — S-127, S-129', () => {
    it('toggling off records engine.pluginToggled', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      const added = await h.add.execute(USER, PLUGIN_DIR);

      const result = await h.setEnabled.execute(USER, added.id, false);

      expect(result.enabled).toBe(false);
      expect(h.events.kinds).toEqual(['engine.pluginAdded', 'engine.pluginToggled']);
    });

    it('toggling to the same state is a no-op — no second event', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      const added = await h.add.execute(USER, PLUGIN_DIR);

      await h.setEnabled.execute(USER, added.id, true);

      expect(h.events.kinds).toEqual(['engine.pluginAdded']);
    });

    it('reverts enabling when the trail fails (widening is not left standing unaudited)', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      const added = await h.add.execute(USER, PLUGIN_DIR);
      await h.setEnabled.execute(USER, added.id, false);
      h.events.failure = new Error('trail unavailable');

      await expect(h.setEnabled.execute(USER, added.id, true)).rejects.toThrow('trail unavailable');
      h.events.failure = null;
      expect((await h.plugins.findById(added.id))?.enabled).toBe(false);
    });

    it('keeps a plugin disabled even if the trail fails on disabling (safe default)', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      const added = await h.add.execute(USER, PLUGIN_DIR);
      h.events.failure = new Error('trail unavailable');

      await expect(h.setEnabled.execute(USER, added.id, false)).rejects.toThrow(
        'trail unavailable',
      );
      h.events.failure = null;
      expect((await h.plugins.findById(added.id))?.enabled).toBe(false);
    });

    it('answers PLUGIN_NOT_FOUND for an id that does not exist — S-129', async () => {
      const h = harness();
      await expect(h.setEnabled.execute(USER, 'nope', false)).rejects.toThrow(PluginNotFoundError);
    });

    it("refuses somebody else's plugin — S-129", async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      const added = await h.add.execute(USER, PLUGIN_DIR);

      await expect(h.setEnabled.execute(STRANGER, added.id, false)).rejects.toThrow(
        PluginForbiddenError,
      );
    });
  });

  describe('RemovePluginUseCase — S-127, S-129', () => {
    it('removes a plugin for good and records engine.pluginRemoved', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      const added = await h.add.execute(USER, PLUGIN_DIR);

      await h.remove.execute(USER, added.id);

      expect(await h.plugins.findById(added.id)).toBeNull();
      expect(h.events.kinds).toEqual(['engine.pluginAdded', 'engine.pluginRemoved']);
    });

    it('answers PLUGIN_NOT_FOUND removing twice — idempotent in effect', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      const added = await h.add.execute(USER, PLUGIN_DIR);
      await h.remove.execute(USER, added.id);

      await expect(h.remove.execute(USER, added.id)).rejects.toThrow(PluginNotFoundError);
    });

    it("refuses somebody else's plugin — S-129", async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      const added = await h.add.execute(USER, PLUGIN_DIR);

      await expect(h.remove.execute(STRANGER, added.id)).rejects.toThrow(PluginForbiddenError);
    });
  });

  describe('ListPluginsUseCase — S-128', () => {
    it('shows current when the manifest still reads as approved', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      await h.add.execute(USER, PLUGIN_DIR);

      const [view] = await h.list.execute(USER);

      expect(view?.state).toBe('current');
      expect(view?.manifest).toEqual(MANIFEST);
    });

    it('goes back to changed when the manifest reads differently afterwards — S-128', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      await h.add.execute(USER, PLUGIN_DIR);

      h.manifests.set(PLUGIN_DIR, CHANGED_MANIFEST);
      const [view] = await h.list.execute(USER);

      expect(view?.state).toBe('changed');
      expect(view?.manifest).toEqual(CHANGED_MANIFEST);
    });

    it('shows unreadable when the directory can no longer be read at all', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      await h.add.execute(USER, PLUGIN_DIR);

      h.manifests.set(PLUGIN_DIR, 'notFound');
      const [view] = await h.list.execute(USER);

      expect(view?.state).toBe('unreadable');
      expect(view?.manifest).toBeNull();
    });

    it('lists only the caller’s own plugins', async () => {
      const h = harness();
      h.manifests.set(PLUGIN_DIR, MANIFEST);
      await h.add.execute(USER, PLUGIN_DIR);

      expect(await h.list.execute(STRANGER)).toEqual([]);
    });
  });
});
