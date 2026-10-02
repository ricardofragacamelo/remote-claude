import { useCallback, useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { logger } from '@/shared/logging/logger';
import { treeRowsOf } from '../lib/tree-rows';
import type { DirectoryState, TreeRows } from '../lib/tree-rows';
import { fetchDirectory } from '../services/explorer.service';
import type { DirectoryListing, ExplorerError } from '../types/explorer';
import { explorerKeys } from './explorer-keys';
import { useExplorerState } from './useExplorerState';

/** What the tree of one folder tab is now. */
export interface ExplorerTree extends TreeRows {
  /** The folder itself, as the server listed it — what the four states of the view are about. */
  readonly root: DirectoryState;

  /** A level as the cache has it. */
  directory(path: string): DirectoryState;

  /** Asks for a level again — a failed one's "try again". */
  retry(path: string): void;
}

/** A level as the cache has it: what was read stays on screen while it is read again. */
function stateOf(client: QueryClient, folder: string, path: string): DirectoryState {
  const query = client.getQueryState<DirectoryListing, ExplorerError>(
    explorerKeys.directory(folder, path),
  );

  if (query?.data !== undefined) {
    return { status: 'ready', listing: query.data };
  }

  return query?.status === 'error' && query.error !== null
    ? { status: 'error', error: query.error }
    : { status: 'loading' };
}

/**
 * Reads the levels of a folder from the cache, each once per generation of it: what one render reads
 * of a level, every row of that render reads the same.
 *
 * @param generation what the levels the tree follows are now — a new one is a new reading
 */
function readerOf(
  client: QueryClient,
  folder: string,
  generation: string,
): (path: string) => DirectoryState {
  const read = new Map<string, DirectoryState>();

  return (path) => {
    const known = read.get(path);

    if (known !== undefined) {
      return known;
    }

    const state = stateOf(client, folder, path);
    read.set(path, state);
    logger.debug(
      { op: 'explorer.directory', folder, path, generation, status: state.status },
      'level read from the cache',
    );
    return state;
  };
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((each, index) => each === right[index]);
}

/**
 * The rows of the tree of one folder tab, and the levels they need.
 *
 * A level is **server data**, in the query cache by folder and path, asked for only when its folder
 * is opened (S-159). It stays fresh until the disk says otherwise — a change, an overflow, a
 * reconnect (B-28) — so opening a folder again reads the cache. What is open, selected and shown is
 * the tab's store, never the cache.
 */
export function useExplorerTree(folder: string): ExplorerTree {
  const client = useQueryClient();
  const state = useExplorerState(folder);
  const [wanted, setWanted] = useState<readonly string[]>(['']);

  const results = useQueries({
    queries: wanted.map((path) => ({
      queryKey: explorerKeys.directory(folder, path),
      queryFn: () => fetchDirectory(folder, path),
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });

  // What the levels are now, as one value: a level that arrived, failed or was read again changes it.
  const version = results
    .map((result) => `${String(result.dataUpdatedAt)}:${String(result.errorUpdatedAt)}`)
    .join(',');

  const directory = useMemo(() => readerOf(client, folder, version), [client, folder, version]);

  const tree = useMemo(
    () =>
      treeRowsOf({
        directory,
        expanded: state.expanded,
        showHidden: state.showHidden,
        sort: state.sort,
        filter: state.filter,
        compact: state.compact,
        creating: state.creating,
        renaming: state.renaming,
      }),
    [
      directory,
      state.expanded,
      state.showHidden,
      state.sort,
      state.filter,
      state.compact,
      state.creating,
      state.renaming,
    ],
  );

  // The levels the rows need, asked for in the next render — a folder opened, a chain compacted.
  if (!sameList(tree.wanted, wanted)) {
    setWanted(tree.wanted);
  }

  const retry = useCallback(
    (path: string) => {
      void client.refetchQueries({ queryKey: explorerKeys.directory(folder, path), exact: true });
    },
    [client, folder],
  );

  return { ...tree, root: directory(''), directory, retry };
}
