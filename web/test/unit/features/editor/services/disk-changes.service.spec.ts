import { afterEach, describe, expect, it, vi } from 'vitest';

import { followDisk } from '@/features/editor/services/disk-changes.service';
import { folderWatches } from '@/shared/api/ws';
import type { FolderWatchSubscriber } from '@/shared/api/folder-watches';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('following a folder on disk for the editor', () => {
  it('joins the folder watch, passes the changes, and reloads only on a watch made again', () => {
    let subscriber: FolderWatchSubscriber | undefined;
    const release = vi.fn();
    vi.spyOn(folderWatches, 'watch').mockImplementation((_, each) => {
      subscriber = each;
      return release;
    });
    const listener = { changed: vi.fn(), resumed: vi.fn() };

    const stop = followDisk('/srv/app', listener);
    subscriber?.onChanges([{ path: 'a', kind: 'changed', origin: 'claude' }], false);
    subscriber?.onWatching(false);
    subscriber?.onWatching(true);
    subscriber?.onStopped('folderDeleted');
    subscriber?.onRefused({ code: 'WATCH_UNAVAILABLE', params: {}, traceId: null });
    stop();

    expect(listener.changed).toHaveBeenCalledWith(
      [{ path: 'a', kind: 'changed', origin: 'claude' }],
      false,
    );
    expect(listener.resumed).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
