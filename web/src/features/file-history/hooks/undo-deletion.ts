import type { QueryClient } from '@tanstack/react-query';

import { logger } from '@/shared/logging/logger';
import { asHistoryError, restoreOrder } from '../lib/entries';
import { restoreVersion } from '../services/history.service';
import type { KeptEntry, RestoreResult } from '../types/history';
import { historyKeys } from './history-keys';

/**
 * The "Undo" of a delete the history kept (07 · B-58, S-344): every entry of it restored where it
 * was — each folder before the files inside it — one request at a time, and how each went. A path
 * that was taken since is not written over (`409`): it is told, and the others still go.
 *
 * @param confirmSensitive the second step of a file that changes what Claude may do was answered
 */
export async function undoDeletion(
  client: QueryClient,
  folder: string,
  entries: readonly KeptEntry[],
  confirmSensitive = false,
): Promise<readonly RestoreResult[]> {
  logger.debug(
    { op: 'fileHistory.undoDelete', folder, count: entries.length },
    'undoing a delete from the local history',
  );

  const results: RestoreResult[] = [];

  for (const entry of restoreOrder(entries)) {
    try {
      await restoreVersion(folder, entry.id, { confirmSensitive });
      results.push({ path: entry.path, ok: true });
    } catch (error) {
      results.push({ path: entry.path, ok: false, error: asHistoryError(error) });
    }
  }

  void client.invalidateQueries({ queryKey: historyKeys.all(folder) });
  return results;
}
