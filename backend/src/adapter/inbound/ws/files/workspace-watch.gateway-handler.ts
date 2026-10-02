import { z } from 'zod';

import type { FolderWatches } from '@application/files';
import type { Logger } from '@shared/logging/logger';
import { ContractCommandHandler } from '../contract-command.gateway-handler';
import { payloadOf } from '../frame-payload';
import type { WsCommandContext, WsCommandHandler, WsCommandOutcome } from '../ws-command';
import type { SocketWatchSinks } from './socket-watch.sinks';

/** The payloads of the `workspace.*` commands, as the contract declares them. */
export const workspaceWatchSchemas = {
  watch: z.object({ workspacePath: z.string().min(1) }),
  unwatch: z.object({ watchId: z.string().min(1) }),
};

/**
 * `workspace.watch` — follow the changes on disk of an open folder (07 · B-21, B-23).
 *
 * It answers its **own** ack, `workspace.watching`, naming the subscription and the real path of
 * the folder; the changes then arrive on the stream of that `watchId`. The sink is held until the
 * gateway has sent the ack, so nothing of the subscription can overtake it.
 *
 * A refusal is the folder's (allowlist, owner, disk), `WATCH_LIMIT_REACHED` or `WATCH_UNAVAILABLE`
 * — an `error` frame, and the socket stays (S-03, S-135, S-136, S-141).
 */
export class WorkspaceWatchHandler implements WsCommandHandler {
  readonly type = 'workspace.watch';

  constructor(
    private readonly watches: FolderWatches,
    private readonly sinks: SocketWatchSinks,
    private readonly logger: Logger,
  ) {}

  async handle(context: WsCommandContext): Promise<WsCommandOutcome> {
    const command = payloadOf(context.frame, workspaceWatchSchemas.watch);
    const sink = this.sinks.open(context.connectionId);
    const watching = await this.watches.watch({
      connectionId: context.connectionId,
      userId: context.userId,
      folder: command.workspacePath,
      sink,
    });

    this.logger.debug(
      {
        op: 'files.watch',
        layer: 'adapter',
        connectionId: context.connectionId,
        watchId: watching.watchId,
        folder: watching.folder,
        watchers: this.watches.openWatchers,
        subscriptions: this.watches.subscriptions,
      },
      'folder watched',
    );

    return {
      ack: {
        type: 'workspace.watching',
        payload: { watchId: watching.watchId, workspacePath: watching.folder },
      },
      then: [],
      publish: () => {
        sink.release();
      },
    };
  }
}

/**
 * `workspace.unwatch` — idempotent: a subscription that already ended, or never was this
 * connection's, is acknowledged all the same (S-140).
 */
export function workspaceUnwatchHandler(
  watches: FolderWatches,
  logger: Logger,
): ContractCommandHandler<z.infer<typeof workspaceWatchSchemas.unwatch>> {
  return new ContractCommandHandler(
    'workspace.unwatch',
    workspaceWatchSchemas.unwatch,
    async (command, context: WsCommandContext) => {
      const known = await watches.unwatch(context.connectionId, command.watchId);

      logger.debug(
        {
          op: 'files.watch',
          layer: 'adapter',
          connectionId: context.connectionId,
          watchId: command.watchId,
          known,
          watchers: watches.openWatchers,
          subscriptions: watches.subscriptions,
        },
        'folder unwatched',
      );
    },
  );
}
