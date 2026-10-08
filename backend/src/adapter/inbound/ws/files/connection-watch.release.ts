import type { FolderWatches } from '@application/files';
import type { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Logger } from '@shared/logging/logger';
import { ConnectionRelease } from '../connection-release';

/**
 * A socket that goes takes its watched folders with it — 07 · B-21, S-142, S-147.
 *
 * Every subscription of it is released; the last one of a folder closes the watcher.
 */
export class ConnectionWatchRelease extends ConnectionRelease {
  constructor(
    registry: ConnectionRegistry,
    private readonly watches: FolderWatches,
    private readonly logger: Logger,
  ) {
    super(registry);
  }

  protected async release(connectionId: string): Promise<void> {
    const released = await this.watches.release(connectionId);

    if (released > 0) {
      this.logger.debug(
        {
          op: 'files.watch',
          layer: 'adapter',
          connectionId,
          released,
          watchers: this.watches.openWatchers,
        },
        'folder watches of a closed connection released',
      );
    }
  }
}
