import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import {
  closeFolder,
  fetchOpenFolders,
  openFolder,
  reorderFolders,
} from '../services/workspace.service';
import type { OpenFolder } from '../types/workspace';
import { stateOf } from './query-state';
import type { QueryState } from './query-state';
import { workspaceKeys } from './workspace-keys';

/** The folder tabs, the four states of reading them, and the way to open one more. */
export interface OpenFolders extends QueryState {
  readonly folders: readonly OpenFolder[];

  /**
   * Opens a folder in a tab — the server records it among the recent ones too.
   *
   * @throws {AppError} the server's refusal, as it came: past the ceiling of tabs it is
   *   `OPEN_FOLDERS_LIMIT_REACHED`, and the caller decides where that is said
   */
  open(path: string): Promise<OpenFolder>;

  /** Closes a tab — never its sessions. The tabs are read again whether or not it worked. */
  close(path: string): Promise<void>;

  /**
   * Puts the tabs in a new order.
   *
   * @throws {AppError} `CONFLICT` when another window changed the set; the tabs are read again
   *   either way, so what is on screen is what the server has
   */
  reorder(paths: readonly string[]): Promise<void>;
}

/**
 * The folder tabs this user has open, in order, on the server
 * ([06 · D-10](../../../../../docs/plans/06-workbench/decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas)).
 *
 * The set follows the user to another device, so it is read again when the window comes back —
 * the default for a list. Opening one invalidates both the tabs and the recent folders: they are the
 * same row on the server, and a list that did not move would say the folder was never opened.
 */
export function useOpenFolders({
  enabled = true,
}: { readonly enabled?: boolean } = {}): OpenFolders {
  const queryClient = useQueryClient();
  const query = useQuery<readonly OpenFolder[], AppError>({
    queryKey: workspaceKeys.openFolders(),
    queryFn: fetchOpenFolders,
    // Nobody signed in has tabs to read: the navigation asks only once somebody is.
    enabled,
  });

  // Stable across renders: the workbench records a folder from an effect, and a new function on
  // every render would record it again on every one of them.
  const open = useCallback(
    async (path: string) => {
      const opened = await openFolder(path);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceKeys.openFolders() }),
        queryClient.invalidateQueries({ queryKey: workspaceKeys.recent() }),
      ]);

      return opened;
    },
    [queryClient],
  );

  // After a change, right or refused, the set on screen is the one the server has: a refusal means
  // another window moved first, and what it left is what is true now (plan 06, S-107).
  const settle = useCallback(
    async (change: () => Promise<void>) => {
      try {
        await change();
      } finally {
        await queryClient.invalidateQueries({ queryKey: workspaceKeys.openFolders() });
      }
    },
    [queryClient],
  );

  const close = useCallback(
    (path: string) =>
      settle(async () => {
        await closeFolder(path);
        // The recent folder is the same row: a tab closed after it left the list is forgotten.
        await queryClient.invalidateQueries({ queryKey: workspaceKeys.recent() });
      }),
    [queryClient, settle],
  );

  const reorder = useCallback(
    (paths: readonly string[]) => settle(() => reorderFolders(paths)),
    [settle],
  );

  return {
    folders: query.data ?? [],
    ...stateOf(query),
    open,
    close,
    reorder,
  };
}
