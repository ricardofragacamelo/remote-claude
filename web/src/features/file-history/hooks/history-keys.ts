import type { HistoryReason } from '../types/history';

/** Where the local history lives in the query cache — by folder, so a restore drops all of it. */
export const historyKeys = {
  all: (folder: string) => ['fileHistory', folder] as const,
  versions: (folder: string, path: string, reason: HistoryReason | null) =>
    ['fileHistory', folder, 'versions', path, reason] as const,
  deleted: (folder: string) => ['fileHistory', folder, 'deleted'] as const,
  limits: ['fileHistory', 'limits'] as const,
};
