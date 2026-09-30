import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/api';
import {
  closeFolder,
  fetchOpenFolders,
  fetchRecentFolders,
  fetchWorkspaces,
  forgetRecentFolder,
  listDirectories,
  openFolder,
  pinRecentFolder,
  reorderFolders,
  resolveFolder,
} from '@/features/workspace/services/workspace.service';

const root = { path: '/srv/projects', label: 'Projects', lastUsedAt: null };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWorkspaces', () => {
  it('asks the one endpoint there is', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ workspaces: [] });

    await fetchWorkspaces();

    expect(get).toHaveBeenCalledWith('/workspaces');
  });

  it('unwraps the envelope, so nothing above it knows the response has one', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ workspaces: [root] });

    expect(await fetchWorkspaces()).toEqual([root]);
  });

  it('lets the failure through, already translated into an app error by the client', async () => {
    const failure = { code: 'FORBIDDEN', messageKey: 'common.error.forbidden', traceId: 't' };
    vi.spyOn(api, 'get').mockRejectedValue(failure);

    await expect(fetchWorkspaces()).rejects.toBe(failure);
  });
});

describe('resolveFolder', () => {
  it('sends the path in the search, encoded, never as a segment of the URL', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ path: '/srv/projects/a b#1', root });

    await resolveFolder('/srv/projects/a b#1');

    expect(get).toHaveBeenCalledWith('/workspaces/resolve?path=%2Fsrv%2Fprojects%2Fa+b%231');
  });

  it('answers the real path the server resolved, and calls the folder by its last segment', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ path: '/srv/projects/real', root });

    expect(await resolveFolder('/srv/projects/link')).toEqual({
      path: '/srv/projects/real',
      name: 'real',
      root,
    });
  });

  it('calls the root of the disk by its path, which has no last segment', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ path: '/', root });

    expect((await resolveFolder('/')).name).toBe('/');
  });
});

describe('listDirectories', () => {
  it('asks for one level, with the dot-folders flag as the literal word', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({});

    await listDirectories({ path: '/srv/projects', hidden: false });

    expect(get).toHaveBeenCalledWith(
      '/workspaces/directories?path=%2Fsrv%2Fprojects&hidden=false',
      {},
    );
  });

  it('sends a prefix only when there is one', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({});

    await listDirectories({ path: '/srv/projects', hidden: true, prefix: 'no' });
    await listDirectories({ path: '/srv/projects', hidden: true, prefix: '' });

    expect(get.mock.calls[0]?.[0]).toBe(
      '/workspaces/directories?path=%2Fsrv%2Fprojects&hidden=true&prefix=no',
    );
    expect(get.mock.calls[1]?.[0]).toBe(
      '/workspaces/directories?path=%2Fsrv%2Fprojects&hidden=true',
    );
  });

  it('joins the caller’s signal to the deadline rather than replacing it — S-77', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({});
    const controller = new AbortController();

    await listDirectories({ path: '/srv/projects', hidden: false }, controller.signal);
    const sent = (get.mock.calls[0]?.[1] as { signal: AbortSignal }).signal;

    expect(sent).not.toBe(controller.signal);
    expect(sent.aborted).toBe(false);
    controller.abort();
    expect(sent.aborted).toBe(true);
  });
});

describe('fetchRecentFolders', () => {
  const recent = (overrides: Record<string, unknown>) => ({
    path: '/srv/projects/app',
    rootLabel: 'Projects',
    lastOpenedAt: '2026-09-29T10:00:00.000Z',
    pinned: false,
    available: true,
    ...overrides,
  });

  it('names each folder, and marks nothing it can still open', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ folders: [recent({})] });

    expect(await fetchRecentFolders()).toEqual([
      {
        path: '/srv/projects/app',
        name: 'app',
        rootLabel: 'Projects',
        lastOpenedAt: '2026-09-29T10:00:00.000Z',
        pinned: false,
        unavailable: null,
      },
    ]);
  });

  it('says a folder under no root any more left the allowlist', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      folders: [recent({ available: false, rootLabel: null })],
    });

    expect((await fetchRecentFolders())[0]?.unavailable).toBe('notAllowed');
  });

  it('says a folder whose root is still there left the disk', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ folders: [recent({ available: false })] });

    expect((await fetchRecentFolders())[0]?.unavailable).toBe('missing');
  });
});

describe('the changes to a recent folder', () => {
  it('pins with PUT, the path in the body', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue(undefined);

    await pinRecentFolder('/srv/projects/app', true);

    expect(put).toHaveBeenCalledWith('/workspaces/recent/pin', {
      path: '/srv/projects/app',
      pinned: true,
    });
  });

  it('forgets with DELETE, the path in the search', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await forgetRecentFolder('/srv/projects/a&b');

    expect(remove).toHaveBeenCalledWith('/workspaces/recent?path=%2Fsrv%2Fprojects%2Fa%26b');
  });
});

describe('the folder tabs', () => {
  const tab = { path: '/srv/projects/app', rootLabel: 'Projects', state: 'available' };

  it('reads them in order, unwrapped', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ folders: [tab] });

    expect(await fetchOpenFolders()).toEqual([tab]);
    expect(get).toHaveBeenCalledWith('/workspaces/open-folders');
  });

  it('opens one with POST, the path in the body', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(tab);

    expect(await openFolder('/srv/projects/app')).toEqual(tab);
    expect(post).toHaveBeenCalledWith('/workspaces/open-folders', { path: '/srv/projects/app' });
  });

  it('closes one with DELETE, the path in the search — plan 06, B-20', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await closeFolder('/srv/projects/a b#1');

    expect(remove).toHaveBeenCalledWith(
      '/workspaces/open-folders?path=%2Fsrv%2Fprojects%2Fa+b%231',
    );
  });

  it('puts them in a new order with PUT, the whole set in the body — S-106', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue(undefined);

    await reorderFolders(['/b', '/a']);

    expect(put).toHaveBeenCalledWith('/workspaces/open-folders/order', { paths: ['/b', '/a'] });
  });
});
