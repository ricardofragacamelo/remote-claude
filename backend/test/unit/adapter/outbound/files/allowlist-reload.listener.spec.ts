import { describe, expect, it } from 'vitest';

import type { FolderWatches, StoppedWatch } from '@application/files';
import { AllowlistReloadListener } from '@adapter/outbound/files/allowlist-reload.listener';
import { WorkspaceNotAllowedError } from '@domain/workspace';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

describe('AllowlistReloadListener — a reload reaching the watched folders — S-143', () => {
  it('revalidates every subscription, and logs each one it stopped', async () => {
    const stopped: StoppedWatch[] = [
      { watchId: 'w_1', folder: '/srv/lost', refusal: new WorkspaceNotAllowedError('/srv/lost') },
    ];
    const watches = {
      openWatchers: 1,
      revalidate: () => Promise.resolve(stopped),
    } as unknown as FolderWatches;
    const log = new RecordingLogger();

    await new AllowlistReloadListener(watches, log.logger).revalidate();

    expect(log.withOp('files.watch')).toEqual([
      expect.objectContaining({ level: 'info', watchId: 'w_1', folder: '/srv/lost' }),
      expect.objectContaining({ level: 'debug', stopped: 1, watchers: 1 }),
    ]);
  });
});
