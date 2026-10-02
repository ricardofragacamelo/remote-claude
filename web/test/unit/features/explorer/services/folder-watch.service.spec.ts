import { afterEach, describe, expect, it, vi } from 'vitest';

import { watchFolder } from '@/features/explorer/services/folder-watch.service';
import { folderWatches } from '@/shared/api/ws';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('following a folder — 07 · D-07', () => {
  it('subscribes through the one set of watches of the socket, and hands the release back', () => {
    const release = vi.fn();
    const watch = vi.spyOn(folderWatches, 'watch').mockReturnValue(release);
    const subscriber = {
      onChanges: vi.fn(),
      onWatching: vi.fn(),
      onStopped: vi.fn(),
      onRefused: vi.fn(),
    };

    expect(watchFolder('/srv/app', subscriber)).toBe(release);
    expect(watch).toHaveBeenCalledWith('/srv/app', subscriber);
  });
});
