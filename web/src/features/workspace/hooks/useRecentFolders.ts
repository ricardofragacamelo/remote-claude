import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import {
  fetchRecentFolders,
  forgetRecentFolder,
  pinRecentFolder,
} from '../services/workspace.service';
import type { RecentFolder } from '../types/workspace';
import { stateOf } from './query-state';
import type { QueryState } from './query-state';
import { workspaceKeys } from './workspace-keys';

/**
 * How many recent folders fit on a screen: past this, the list gets a search
 * ([06 · D-24](../../../../../docs/plans/06-workbench/decisions.md#d-24--o-atalho-do-abrir-pasta-e-quando-a-lista-de-recentes-ganha-busca)).
 */
export const SEARCH_AFTER = 8;

/** The recent folders, the four states of reading them, and what a row can do. */
export interface RecentFolders extends QueryState {
  readonly folders: readonly RecentFolder[];

  /** The folders the search leaves — all of them while there is no search. */
  readonly visible: readonly RecentFolder[];

  /** The list is longer than a screen, and gets a search. */
  readonly searchable: boolean;
  readonly search: string;
  setSearch(value: string): void;

  pin(path: string, pinned: boolean): void;
  forget(path: string): void;

  /** A change to this row is on its way, and a second one would not be sent. */
  isBusy(path: string): boolean;

  /** Why the last change to this row was refused, until the next one is tried. */
  failureOf(path: string): AppError | null;
}

/**
 * The folders this user opened — pinned first, the unavailable ones marked rather than dropped.
 *
 * A change to a row is **not** optimistic: the server says, then the list is read again. Pinning is
 * cheap to undo, but a row that moved and then moved back when the server refused would be a list
 * that lied for a moment (docs/architecture/web/04-state-and-data.md#mutação). A refused change
 * leaves the row as it was and keeps the reason beside it; a second click on a row whose change has
 * not come back sends nothing (plan 06, S-184).
 */
export function useRecentFolders(): RecentFolders {
  const queryClient = useQueryClient();
  const query = useQuery<readonly RecentFolder[], AppError>({
    queryKey: workspaceKeys.recent(),
    queryFn: fetchRecentFolders,
  });

  // The guard is a ref, not the state below: two clicks in the same tick both read the state from
  // before either of them, and both would pass.
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<ReadonlyMap<string, AppError>>(new Map());
  const [search, setSearch] = useState('');
  const folders = query.data ?? [];
  const needle = search.trim().toLocaleLowerCase();

  const change = useCallback(
    (path: string, send: () => Promise<void>) => {
      if (inFlight.current.has(path)) {
        return;
      }

      inFlight.current.add(path);
      setBusy(new Set(inFlight.current));
      setFailures((current) => without(current, path));

      void send()
        .then(() => queryClient.invalidateQueries({ queryKey: workspaceKeys.recent() }))
        .catch((error: AppError) => {
          setFailures((current) => new Map(current).set(path, error));
        })
        .finally(() => {
          inFlight.current.delete(path);
          setBusy(new Set(inFlight.current));
        });
    },
    [queryClient],
  );

  return {
    folders,
    visible: folders.filter(
      (folder) =>
        folder.name.toLocaleLowerCase().includes(needle) ||
        folder.path.toLocaleLowerCase().includes(needle),
    ),
    searchable: folders.length > SEARCH_AFTER,
    search,
    setSearch,
    ...stateOf(query),
    pin: (path, pinned) => {
      change(path, () => pinRecentFolder(path, pinned));
    },
    forget: (path) => {
      change(path, () => forgetRecentFolder(path));
    },
    isBusy: (path) => busy.has(path),
    failureOf: (path) => failures.get(path) ?? null,
  };
}

/** The map without one key — a new map, so React sees the change. */
function without(map: ReadonlyMap<string, AppError>, key: string): ReadonlyMap<string, AppError> {
  if (!map.has(key)) {
    return map;
  }

  const next = new Map(map);
  next.delete(key);
  return next;
}
