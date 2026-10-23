import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/api';
import {
  addLocalPlugin,
  applyPluginUpdate,
  fetchMarketplaceCatalog,
  fetchMarketplaces,
  fetchPluginUpdate,
  fetchPlugins,
  installMarketplacePlugin,
  previewLocalPlugin,
  removePlugin,
  setPluginEnabled,
} from '@/engines/claude/settings/services/plugin.service';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchPlugins', () => {
  it('asks the store, and unwraps the envelope', async () => {
    const plugin = { id: 'p1', name: 'my-plugin' };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ plugins: [plugin] });

    expect(await fetchPlugins()).toEqual([plugin]);
    expect(get).toHaveBeenCalledWith('/engines/claude/plugins');
  });
});

describe('previewLocalPlugin', () => {
  it('posts the path to the preview route', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      manifest: { name: 'my-plugin' },
      messageKey: 'engines.claude.plugin.descriptionLocal',
      params: {},
    });

    await previewLocalPlugin('/srv/app');

    expect(post).toHaveBeenCalledWith('/engines/claude/plugins/preview', { path: '/srv/app' });
  });
});

describe('addLocalPlugin', () => {
  it('posts the path to the store', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'p1' });

    await addLocalPlugin('/srv/app');

    expect(post).toHaveBeenCalledWith('/engines/claude/plugins', { path: '/srv/app' });
  });
});

describe('installMarketplacePlugin', () => {
  it('posts the marketplace and plugin name, never a preview call first — D-90', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'p1' });

    await installMarketplacePlugin('official', 'linter-pack');

    expect(post).toHaveBeenCalledWith('/engines/claude/plugins/marketplace', {
      marketplace: 'official',
      plugin: 'linter-pack',
    });
  });
});

describe('setPluginEnabled', () => {
  it('patches only the one field this write changes', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ id: 'p1', enabled: false });

    await setPluginEnabled('p1', false);

    expect(patch).toHaveBeenCalledWith('/engines/claude/plugins/p1', { enabled: false });
  });
});

describe('removePlugin', () => {
  it('deletes by id', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await removePlugin('p1');

    expect(del).toHaveBeenCalledWith('/engines/claude/plugins/p1');
  });
});

describe('fetchPluginUpdate', () => {
  it('reads the update check of one plugin, never writing', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ available: false, newCommit: null, diff: null });

    await fetchPluginUpdate('p1');

    expect(get).toHaveBeenCalledWith('/engines/claude/plugins/p1/update');
  });
});

describe('applyPluginUpdate', () => {
  it('posts to the update route of one plugin, with no body', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'p1' });

    await applyPluginUpdate('p1');

    expect(post).toHaveBeenCalledWith('/engines/claude/plugins/p1/update', {});
  });
});

describe('fetchMarketplaces', () => {
  it('asks the declared marketplaces', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ marketplaces: [{ name: 'official' }] });

    await fetchMarketplaces();

    expect(get).toHaveBeenCalledWith('/engines/claude/plugins/marketplaces');
  });
});

describe('fetchMarketplaceCatalog', () => {
  it('asks one marketplace by name, encoded', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ name: 'a b', plugins: [] });

    await fetchMarketplaceCatalog('a b');

    expect(get).toHaveBeenCalledWith('/engines/claude/plugins/marketplaces/a%20b');
  });
});
