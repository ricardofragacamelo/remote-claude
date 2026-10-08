import type { CancelScheduled, Scheduler } from '@application/shared';
import type { LabelledChange, WatchSink, WatchStopReason } from '@application/files';
import type { Logger } from '@shared/logging/logger';
import { NumberedStream } from '../numbered-stream';
import type { StreamTransport } from '../numbered-stream';

/** How often a sink whose socket fell behind looks again whether it caught up. */
export const CATCH_UP_INTERVAL_MS = 250;

/** What the sinks of every connection share. */
export interface SinkTransport extends StreamTransport {
  readonly scheduler: Scheduler;
  readonly logger: Logger;
  /** Past this many bytes queued on a socket, its changes are owed as one `overflow`. */
  readonly maxBufferedBytes: number;
}

/**
 * The stream of one subscription, on one socket — 07 · B-23, D-07.
 *
 * - **`seq` is the `watchId`'s**, from 1, and no session's: the frame carries no `sessionId`, and
 *   nothing is kept for a replay — there is none (S-152, S-154).
 * - **Nothing before the ack.** The sink is held until the gateway has sent `workspace.watching`;
 *   a change seen before that is dropped — the client loads the tree after the ack, and sees it
 *   there — and a stop is kept until the hold lifts.
 * - **A client that falls behind is not waited for.** When its socket holds more than the bound,
 *   what would have gone is owed as one `overflow: true`, sent when it catches up: the watcher
 *   delivers to the others meanwhile, and the slow client reloads instead of patching (S-155).
 */
export class SocketWatchSink implements WatchSink {
  private readonly stream: NumberedStream;
  private held = true;
  private owed = false;
  private ended = false;
  private pendingStop: { readonly watchId: string; readonly reason: WatchStopReason } | null = null;
  private catchUp: CancelScheduled | null = null;

  constructor(
    private readonly connectionId: string,
    private readonly transport: SinkTransport,
  ) {
    this.stream = new NumberedStream(connectionId, transport);
  }

  get open(): boolean {
    return this.stream.open;
  }

  /** The ack went out: from now on, what the subscription produces reaches the client. */
  release(): void {
    this.held = false;

    if (this.pendingStop !== null) {
      this.stopped(this.pendingStop.watchId, this.pendingStop.reason);
    }
  }

  changes(watchId: string, changes: readonly LabelledChange[], overflow: boolean): void {
    if (this.held || this.ended) {
      return;
    }

    if (this.behind()) {
      this.owe(watchId);
      return;
    }

    this.sendChanges(watchId, changes, overflow);
  }

  stopped(watchId: string, reason: WatchStopReason): void {
    if (this.held) {
      this.pendingStop = { watchId, reason };
      return;
    }

    this.send('workspace.watchStopped', { watchId, reason });
    this.transport.logger.info(
      { op: 'files.watch', layer: 'adapter', connectionId: this.connectionId, watchId, reason },
      'folder watch stopped',
    );
    this.end();
  }

  end(): void {
    this.ended = true;
    this.catchUp?.();
    this.catchUp = null;
  }

  private sendChanges(
    watchId: string,
    changes: readonly LabelledChange[],
    overflow: boolean,
  ): void {
    const lost = overflow || this.owed;
    this.owed = false;

    const seq = this.send('workspace.filesChanged', {
      watchId,
      changes,
      ...(lost ? { overflow: true } : {}),
    });

    this.transport.logger.debug(
      {
        op: 'files.watch',
        layer: 'adapter',
        connectionId: this.connectionId,
        watchId,
        seq,
        changes: changes.length,
        overflow: lost,
      },
      'folder changes sent',
    );
  }

  private behind(): boolean {
    const socket = this.transport.registry.get(this.connectionId)?.socket;

    return (socket?.bufferedAmount ?? 0) > this.transport.maxBufferedBytes;
  }

  /** Owes the client an overflow, and looks again later — the next change may never come. */
  private owe(watchId: string): void {
    if (!this.owed) {
      this.transport.logger.warn(
        { op: 'files.watch', layer: 'adapter', connectionId: this.connectionId, watchId },
        'a socket fell behind; its folder changes are owed as an overflow',
      );
    }

    this.owed = true;
    this.catchUp ??= this.transport.scheduler.after(CATCH_UP_INTERVAL_MS, () => {
      this.catchUp = null;

      if (!this.ended && this.owed) {
        this.changes(watchId, [], true);
      }
    });
  }

  /** One numbered event of this subscription to its connection; the `seq` it got. */
  private send(type: string, payload: Readonly<Record<string, unknown>>): number | null {
    return this.stream.send(type, payload);
  }
}

/** Opens one sink per subscription, over the transport every connection shares. */
export class SocketWatchSinks {
  constructor(private readonly transport: SinkTransport) {}

  open(connectionId: string): SocketWatchSink {
    return new SocketWatchSink(connectionId, this.transport);
  }
}
