import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { FolderWatches } from '@application/files';
import { WORKSPACE_ALLOWLIST_RELOADED } from '@application/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * A reload of the allowlist reaching the watched folders — 07 · B-21, S-143.
 *
 * The reload is announced on the internal bus and `files` hears it here, without `workspace`
 * knowing who listens: every subscription's folder is asked again through the folder resolver,
 * and the ones refused now end with `workspace.watchStopped { reason: allowlistChanged }`.
 */
@Injectable()
export class AllowlistReloadListener {
  constructor(
    @Inject(FolderWatches) private readonly watches: FolderWatches,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @OnEvent(WORKSPACE_ALLOWLIST_RELOADED)
  async revalidate(): Promise<void> {
    const stopped = await this.watches.revalidate();

    for (const watch of stopped) {
      this.logger.info(
        {
          op: 'files.watch',
          layer: 'adapter',
          watchId: watch.watchId,
          folder: watch.folder,
          err: watch.refusal,
        },
        'folder watch stopped: the allowlist no longer allows it',
      );
    }

    this.logger.debug(
      {
        op: 'files.watch',
        layer: 'adapter',
        stopped: stopped.length,
        watchers: this.watches.openWatchers,
      },
      'folder watches revalidated after an allowlist reload',
    );
  }
}
