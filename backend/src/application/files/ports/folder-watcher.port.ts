import type { FolderChange } from '@domain/files';

/** Why a watcher stopped on its own: the system refused it a watch, or its folder went away. */
export type WatcherStop = 'systemLimit' | 'folderDeleted';

/** What a watcher tells as it runs. */
export interface FolderWatchListener {
  /** One raw change, before any coalescing — relative POSIX to the watched folder, `''` itself. */
  changed(change: FolderChange): void;

  /** The watcher died: nothing more will arrive, and it has already let go of what it held. */
  stopped(reason: WatcherStop): void;
}

/** A watcher that is running. */
export interface OpenWatch {
  /** Lets go of every watch it holds. Idempotent. */
  close(): Promise<void>;
}

/**
 * Following the changes on disk under one folder (07 · B-20, D-08).
 *
 * The adapter leaves `.git` and the D-10 folders alone **before** spending a watch on them — never
 * after (`isUnwatched` of the domain) — and says so when the system refuses a watch: at the start,
 * by rejecting; later, by {@link FolderWatchListener.stopped}. A watcher that goes quiet is the
 * one failure this port does not allow.
 */
export interface FolderWatcher {
  /**
   * @param root the real path of the folder
   * @returns once the watcher is ready: every change from then on reaches `listener`
   * @throws {import('@domain/files').WatchUnavailableError} the system refused a watch — and
   *   nothing is left held
   */
  watch(root: string, listener: FolderWatchListener): Promise<OpenWatch>;
}

export const FOLDER_WATCHER = Symbol('FolderWatcher');
