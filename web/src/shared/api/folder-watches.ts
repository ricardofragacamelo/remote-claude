import type { Envelope } from '@remote-claude/contracts';

import { logger } from '@/shared/logging/logger';
import type { ConnectionStatus } from './ws-client';

/** What happened to one path of a folder being watched — the contract's `changes[]` item. */
export interface FolderChange {
  /** Relative to the folder, POSIX. */
  readonly path: string;
  readonly kind: 'created' | 'changed' | 'deleted';

  /** Who changed it, as far as the server can tell — a label, never a decision. */
  readonly origin?: 'claude' | 'user' | 'external';
}

/** Why a subscription ended without anybody here asking. */
export type WatchStopReason = 'allowlistChanged' | 'folderDeleted' | 'systemLimit';

/** A refusal of `workspace.watch`, as the `error` frame carried it. */
export interface WatchRefusal {
  readonly code: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly traceId: string | null;
}

/** What a feature needs from the changes of one folder. */
export interface FolderWatchSubscriber {
  /**
   * What changed, coalesced by the server.
   *
   * @param overflow more changed than the event carries — or a frame was lost on the way: reload
   *   what is shown instead of patching it
   */
  onChanges(changes: readonly FolderChange[], overflow: boolean): void;

  /**
   * The server is watching. `again` is a subscription made after one this socket already had —
   * a reconnect: there is no replay (07 · D-07), so what is on screen is reloaded.
   */
  onWatching(again: boolean): void;

  /** Nothing more will arrive for this folder until it is watched anew. */
  onStopped(reason: WatchStopReason): void;

  /** `workspace.watch` was refused — `WATCH_UNAVAILABLE`, `WATCH_LIMIT_REACHED`, the folder's own. */
  onRefused(refusal: WatchRefusal): void;
}

/** The part of the socket client the watches need. */
export interface WatchTransport {
  issue(type: string, payload: Readonly<Record<string, unknown>>): string | null;
  command(type: string, payload: Readonly<Record<string, unknown>>): boolean;
  observe(listener: (frame: Envelope) => void): () => void;
  onStatus(watcher: (status: ConnectionStatus) => void): () => void;
}

/** The watched folders of one socket client. */
export interface FolderWatches {
  /**
   * Follows the changes of `folder` for `subscriber`, while it wants them.
   *
   * One `workspace.watch` per folder however many features follow it — the explorer and the editor
   * of a tab both do —, sent again whenever the socket comes back, and one `workspace.unwatch` when
   * the last of them lets go. A server that answers the same `watchId` to a second watch of the same
   * connection would otherwise end both features' subscription with the first unwatch.
   *
   * @param folder the folder of the tab, absolute — the `workspacePath` of the command
   * @returns the release — idempotent
   */
  watch(folder: string, subscriber: FolderWatchSubscriber): () => void;
}

/** One folder being followed, and where its subscription stands. */
interface Watched {
  readonly folder: string;
  readonly subscribers: Set<FolderWatchSubscriber>;

  /** The id of the `workspace.watch` frame waiting for its answer. */
  pending: string | null;
  watchId: string | null;
  lastSeq: number;

  /** Whether a subscription of this socket client was ever made for it — a next one is "again". */
  watchedBefore: boolean;
}

function changesOf(payload: Readonly<Record<string, unknown>>): readonly FolderChange[] {
  return Array.isArray(payload['changes']) ? (payload['changes'] as FolderChange[]) : [];
}

function refusalOf(frame: Envelope): WatchRefusal {
  const payload = frame.payload ?? {};

  return {
    code: typeof payload['code'] === 'string' ? payload['code'] : 'INTERNAL_ERROR',
    params:
      typeof payload['params'] === 'object' && payload['params'] !== null
        ? (payload['params'] as Record<string, unknown>)
        : {},
    traceId: frame.traceId ?? null,
  };
}

/**
 * The `workspace.*` subscriptions of one socket client (07 · B-28, D-07).
 *
 * It owns the bookkeeping the stream needs and nothing else: which folder each `watchId` is, the
 * `seq` of each — its own, from 1, never a session's —, the watch sent again after a reconnect,
 * and the unwatch of a subscription whose answer had not arrived yet when its last follower left.
 * A `seq` that skips ahead means a frame was lost, and is told as an overflow: the screen reloads
 * rather than trusting a patch with a hole in it.
 */
export function createFolderWatches(transport: WatchTransport): FolderWatches {
  const watched = new Map<string, Watched>();

  /** Answers still owed to a watch whose followers are all gone; unwatched as they arrive. */
  const abandoned = new Set<string>();
  let ready = false;

  function send(entry: Watched): void {
    entry.pending = transport.issue('workspace.watch', { workspacePath: entry.folder });
    logger.debug({ op: 'files.watch', folder: entry.folder }, 'folder watch requested');
  }

  function byWatchId(watchId: unknown): Watched | undefined {
    return [...watched.values()].find((entry) => entry.watchId === watchId);
  }

  /** The folder whose `workspace.watch` this frame answers. */
  function answering(frame: Envelope): Watched | undefined {
    return [...watched.values()].find((entry) => entry.pending === frame.correlationId);
  }

  function answered(frame: Envelope): void {
    const watchId = frame.payload?.['watchId'];

    if (typeof watchId !== 'string') {
      return;
    }

    if (frame.correlationId !== undefined && abandoned.delete(frame.correlationId)) {
      transport.command('workspace.unwatch', { watchId });
      return;
    }

    const entry = answering(frame);

    if (entry === undefined) {
      return;
    }

    const again = entry.watchedBefore;
    entry.pending = null;
    entry.watchId = watchId;
    entry.lastSeq = 0;
    entry.watchedBefore = true;

    for (const subscriber of entry.subscribers) {
      subscriber.onWatching(again);
    }
  }

  function changed(frame: Envelope): void {
    const payload = frame.payload ?? {};
    const entry = byWatchId(payload['watchId']);
    const seq = frame.seq ?? 0;

    if (entry === undefined || seq <= entry.lastSeq) {
      return;
    }

    const lost = seq > entry.lastSeq + 1;
    entry.lastSeq = seq;

    if (lost) {
      logger.warn({ op: 'files.watch', folder: entry.folder, seq }, 'folder watch lost a frame');
    }

    for (const subscriber of entry.subscribers) {
      subscriber.onChanges(changesOf(payload), lost || payload['overflow'] === true);
    }
  }

  function stopped(frame: Envelope): void {
    const payload = frame.payload ?? {};
    const entry = byWatchId(payload['watchId']);

    if (entry === undefined) {
      return;
    }

    entry.watchId = null;
    const reason = payload['reason'] as WatchStopReason;
    logger.warn({ op: 'files.watch', folder: entry.folder, reason }, 'folder watch stopped');

    for (const subscriber of entry.subscribers) {
      subscriber.onStopped(reason);
    }
  }

  function refused(frame: Envelope): void {
    const entry = answering(frame);

    if (entry === undefined) {
      return;
    }

    entry.pending = null;
    const refusal = refusalOf(frame);
    logger.warn(
      { op: 'files.watch', folder: entry.folder, code: refusal.code },
      'folder watch refused',
    );

    for (const subscriber of entry.subscribers) {
      subscriber.onRefused(refusal);
    }
  }

  transport.observe((frame) => {
    if (frame.type === 'workspace.watching') {
      answered(frame);
    } else if (frame.type === 'workspace.filesChanged') {
      changed(frame);
    } else if (frame.type === 'workspace.watchStopped') {
      stopped(frame);
    } else if (frame.kind === 'error' && frame.correlationId !== undefined) {
      refused(frame);
    }
  });

  transport.onStatus((status) => {
    const nowReady = status === 'ready';

    if (nowReady === ready) {
      return;
    }

    ready = nowReady;
    // A subscription dies with its socket; the answers it owed die with it too.
    abandoned.clear();

    for (const entry of watched.values()) {
      entry.pending = null;
      entry.watchId = null;

      if (ready) {
        send(entry);
      }
    }
  });

  return {
    watch(folder, subscriber) {
      const existing = watched.get(folder);
      const entry: Watched = existing ?? {
        folder,
        subscribers: new Set(),
        pending: null,
        watchId: null,
        lastSeq: 0,
        watchedBefore: false,
      };

      entry.subscribers.add(subscriber);

      if (existing === undefined) {
        watched.set(folder, entry);

        if (ready) {
          send(entry);
        }
      } else if (entry.watchId !== null) {
        // Joining a subscription that already stands: nothing to send, and nothing to reload.
        subscriber.onWatching(false);
      }

      let released = false;

      return () => {
        if (released) {
          return;
        }

        released = true;
        entry.subscribers.delete(subscriber);

        if (entry.subscribers.size > 0 || watched.get(folder) !== entry) {
          return;
        }

        watched.delete(folder);

        if (entry.watchId !== null) {
          transport.command('workspace.unwatch', { watchId: entry.watchId });
        } else if (entry.pending !== null) {
          abandoned.add(entry.pending);
        }

        logger.debug({ op: 'files.watch', folder }, 'folder watch released');
      };
    },
  };
}
