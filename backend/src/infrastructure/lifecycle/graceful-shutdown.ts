import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';

import { FolderWatches } from '@application/files';
import { ShutdownSessionsUseCase } from '@application/session';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { AppGateway } from '../websocket/app.gateway';

/**
 * The shutdown, in the order docs/architecture/backend/06-realtime.md#shutdown writes it — B-04.
 *
 * 1. stop accepting connections;
 * 2. `session.closed { reason: 'shutdown' }` to every session;
 * 3. every socket closed with `1001`, which a client answers by reconnecting with backoff — and
 *    every folder watcher closed with them, so no inotify watch outlives the process's sockets
 *    (plan 07, S-146);
 * 4. `query.close()` on **every** live session — skipping it leaves CLI processes orphaned on the
 *    user's machine;
 * 5. the database pool drained — which is `DatabaseLifecycle.onApplicationShutdown`, and Nest runs
 *    every `onApplicationShutdown` after every `onModuleDestroy`, so it cannot overtake step 4.
 *
 * One object keeps the order because the order crosses modules: the gateway owns the sockets and
 * the session module owns the subprocesses, and neither closing itself in its own hook could say
 * which went first.
 *
 * Asked twice — a second signal, or a hook and a test — it answers the first run's promise and
 * does nothing again (S-14).
 */
@Injectable()
export class GracefulShutdown implements OnModuleDestroy {
  private running: Promise<void> | null = null;

  constructor(
    @Inject(AppGateway) private readonly gateway: AppGateway,
    @Inject(ShutdownSessionsUseCase) private readonly sessions: ShutdownSessionsUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(FolderWatches) private readonly watches: Pick<FolderWatches, 'closeAll'>,
  ) {}

  onModuleDestroy(): Promise<void> {
    return this.shutdown();
  }

  shutdown(): Promise<void> {
    this.running ??= this.run();
    return this.running;
  }

  private async run(): Promise<void> {
    const context = { op: 'server.shutdown', layer: 'infrastructure' };
    this.logger.info(context, 'shutting down');

    this.gateway.stopAccepting();
    const announced = this.sessions.announce();
    const sockets = this.gateway.closeAll();
    const watchers = await this.watches.closeAll();
    const { closed, failed } = await this.sessions.release();

    const line = { ...context, announced, sockets, watchers, closed, failed };
    if (failed > 0) {
      // The entry is gone either way; the boot sweep of the next start is what catches a
      // subprocess that refused to close (B-03).
      this.logger.warn(line, 'some sessions did not close cleanly');
    } else {
      this.logger.info(line, 'every session closed');
    }
  }
}
