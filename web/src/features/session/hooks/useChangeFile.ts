import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchChangeFile } from '../services/changes.service';
import type { ChangeFile } from '../types/changes';
import { changeKeys } from './change-keys';
import { loadedOf } from './loaded';
import type { Loaded } from './loaded';

/**
 * One file of what a session changed — before, now and the hunks between (plan 08, B-26) — read
 * when its hunks open, and again after anything that moved the disk: the revision a rejection
 * carries has to be the disk's.
 */
export function useChangeFile(sessionId: string, path: string): Loaded<ChangeFile> {
  return loadedOf(
    useQuery<ChangeFile, AppError>({
      queryKey: changeKeys.file(sessionId, path),
      queryFn: () => fetchChangeFile(sessionId, path),
      staleTime: 0,
      retry: false,
    }),
  );
}
