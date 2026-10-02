import { folderWatches } from '@/shared/api/ws';
import type { FolderChange } from '@/shared/api/folder-watches';
import { logger } from '@/shared/logging/logger';

/** What the editor does with the changes of its folder on disk. */
export interface DiskChangeListener {
  /** What changed — `overflow` when more changed than was said: every open file is checked. */
  changed(changes: readonly FolderChange[], overflow: boolean): void;

  /** The folder is followed again after the socket came back: what changed meanwhile is unknown. */
  resumed(): void;
}

/**
 * Follows the changes of a folder on disk for the editor — the same `workspace.watch` the explorer
 * of the tab follows: one subscription per folder, however many features listen (07 · B-28).
 *
 * The editor has nothing of its own to say about a refusal or a stop — the explorer shows those — so
 * both only reach the log.
 *
 * @returns the way to stop
 */
export function followDisk(folder: string, listener: DiskChangeListener): () => void {
  return folderWatches.watch(folder, {
    onChanges: (changes, overflow) => {
      listener.changed(changes, overflow);
    },
    onWatching: (again) => {
      if (again) {
        listener.resumed();
      }
    },
    onStopped: (reason) => {
      logger.debug({ op: 'editor.watch', folder, reason }, 'editor stopped following the folder');
    },
    onRefused: (refusal) => {
      logger.debug(
        { op: 'editor.watch', folder, code: refusal.code },
        'editor could not follow the folder',
      );
    },
  });
}
