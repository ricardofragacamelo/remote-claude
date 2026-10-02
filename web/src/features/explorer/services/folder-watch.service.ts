import { folderWatches } from '@/shared/api/ws';
import type { FolderWatchSubscriber } from '@/shared/api/folder-watches';

export type {
  FolderChange,
  FolderWatchSubscriber,
  WatchRefusal,
  WatchStopReason,
} from '@/shared/api/folder-watches';

/**
 * Follows the changes on disk of the folder of a tab (`workspace.watch`, 07 · D-07).
 *
 * One subscription per folder on the socket however many features follow it — the editor of the same
 * tab follows it too. Sent again by the socket whenever it comes back; the subscriber is told, and
 * reloads, since there is no replay.
 *
 * @returns the release — idempotent
 */
export function watchFolder(folder: string, subscriber: FolderWatchSubscriber): () => void {
  return folderWatches.watch(folder, subscriber);
}
