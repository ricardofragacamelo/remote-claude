import { skipToken, useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { listDirectories } from '../services/workspace.service';
import type { DirectoryListing, DirectoryQuery } from '../types/workspace';
import { workspaceKeys } from './workspace-keys';

/** One listing, and the four states of reading it. */
export interface Directories {
  /** `undefined` until the listing of **this** question arrives — never the previous folder's. */
  readonly listing: DirectoryListing | undefined;
  readonly isLoading: boolean;
  readonly error: AppError | null;
  reload(): void;
}

/**
 * One level of one folder, asked for when the dialog shows it.
 *
 * Browsing fast fires several listings, and they come back in any order. Each is cached under its
 * own question, and the one nobody is waiting for any more is cancelled through the `signal` the
 * query hands the service — so a slow answer for the folder left behind can never be shown for the
 * folder the person is in now (plan 06, S-77). There is no "keep the previous data while loading":
 * the previous data is another folder.
 *
 * Read fresh each time (`staleTime` 0): a listing describes the disk, and the disk changes.
 *
 * @param request what to list, or `null` for nothing at all (the dialog is on its roots)
 */
export function useDirectories(request: DirectoryQuery | null): Directories {
  const query = useQuery<DirectoryListing, AppError>({
    queryKey:
      request === null ? [...workspaceKeys.all, 'directories'] : workspaceKeys.directories(request),
    queryFn: request === null ? skipToken : ({ signal }) => listDirectories(request, signal),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  return {
    listing: query.data,
    isLoading: request !== null && query.isPending,
    error: query.error,
    reload: () => {
      void query.refetch();
    },
  };
}
