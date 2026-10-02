import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import type { FolderWatches } from '@application/files';
import type { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Logger } from '@shared/logging/logger';

/**
 * A socket that goes takes its watched folders with it — 07 · B-21, S-142, S-147.
 *
 * Whatever took the connection out of the registry — the client closing, the heartbeat, a
 * revocation closing it with `4401`, a failed send, the shutdown — this hears it once and releases
 * every subscription of it; the last one of a folder closes the watcher. The gateway keeps no
 * branch for it: the registry tells, and this is who listens.
 */
export class ConnectionWatchRelease implements OnModuleInit, OnModuleDestroy {
  private stopListening: (() => void) | null = null;

  constructor(
    private readonly registry: ConnectionRegistry,
    private readonly watches: FolderWatches,
    private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.stopListening = this.registry.onRemoved((connectionId) => {
      void this.release(connectionId);
    });
  }

  onModuleDestroy(): void {
    this.stopListening?.();
    this.stopListening = null;
  }

  private async release(connectionId: string): Promise<void> {
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
