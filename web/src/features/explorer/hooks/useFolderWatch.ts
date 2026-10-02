import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { logger } from '@/shared/logging/logger';
import { isWithin, parentOf } from '../lib/paths';
import { watchFolder } from '../services/folder-watch.service';
import type { FolderChange, FolderWatchSubscriber } from '../services/folder-watch.service';
import { explorerStore } from '../store/explorer.store';
import { explorerKeys } from './explorer-keys';

/** Every level of the folder read again — the ones on screen now, the others when next opened. */
export function reloadFolder(client: QueryClient, folder: string): void {
  void client.invalidateQueries({ queryKey: explorerKeys.directories(folder) });
}

/**
 * The levels read while the tab was not on screen, read again — and only those: a level being read
 * for the first time is left to finish.
 */
function rereadKnown(client: QueryClient, folder: string): void {
  void client.invalidateQueries({
    queryKey: explorerKeys.directories(folder),
    predicate: (query) => query.state.dataUpdatedAt > 0 && query.state.fetchStatus === 'idle',
  });
}

/**
 * What changed, applied to the cache: the level each change happened in is read again — a new entry
 * appears, a deleted one goes (S-188) —, and a folder that went takes its own levels with it.
 */
export function applyChanges(
  client: QueryClient,
  folder: string,
  changes: readonly FolderChange[],
): void {
  for (const parent of new Set(changes.map((change) => parentOf(change.path)))) {
    void client.invalidateQueries({
      queryKey: explorerKeys.directory(folder, parent),
      exact: true,
    });
  }

  for (const change of changes.filter((each) => each.kind === 'deleted')) {
    client.removeQueries({
      queryKey: explorerKeys.directories(folder),
      predicate: (query) => {
        const path = query.queryKey[3];
        return (
          typeof path === 'string' && (path === change.path || path.startsWith(`${change.path}/`))
        );
      },
    });
  }
}

/**
 * What went from the disk leaves the selection — the row the keyboard was on stays named, so the tree
 * can put the keyboard on its neighbour (S-189).
 */
function forgetSelected(folder: string, changes: readonly FolderChange[]): void {
  const gone = changes.filter((change) => change.kind === 'deleted').map((change) => change.path);
  const store = explorerStore(folder).getState();
  const kept = store.selection.filter((path) => !gone.some((each) => isWithin(path, each)));

  if (kept.length !== store.selection.length) {
    store.select(kept, store.focused, store.anchor);
  }
}

/** What the explorer does with what the server says about the folder it follows. */
function subscriberOf(client: QueryClient, folder: string): FolderWatchSubscriber {
  const store = explorerStore(folder);

  return {
    onChanges: (changes, overflow) => {
      logger.debug(
        { op: 'explorer.changes', folder, count: changes.length, overflow },
        'folder changed on disk',
      );

      if (overflow) {
        reloadFolder(client, folder);
      } else {
        applyChanges(client, folder, changes);
        forgetSelected(folder, changes);
      }
    },
    onWatching: (again) => {
      store.getState().setWatch({ state: 'following' });

      if (again) {
        reloadFolder(client, folder);
      }
    },
    onStopped: (reason) => {
      store.getState().setWatch({ state: 'stopped', reason });
    },
    onRefused: (refusal) => {
      store.getState().setWatch({ state: 'unavailable', code: refusal.code });
    },
  };
}

/**
 * Follows the disk of a folder tab while it is the one on screen (B-28).
 *
 * `workspace.watch` when the tab is on screen, released when it is not — a tab that is not on screen
 * spends no watcher (06 · D-11) — and every level read again when it comes back, so what changed
 * meanwhile is there (S-192). A reconnect and an overflow read everything again, since there is no
 * replay (S-190, S-191). A watcher the machine refused is a warning with a reload by hand (S-194); a
 * folder that went is this tab's error, and no other's (S-195).
 *
 * @param enabled whether the folder can be followed at all — not a tab the server refused
 */
export function useFolderWatch(folder: string, enabled: boolean): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const store = explorerStore(folder);
    const subscriber = subscriberOf(client, folder);
    rereadKnown(client, folder);
    let release = watchFolder(folder, subscriber);

    // A reload by hand reads everything again — and, after the machine refused the watcher, asks
    // for it again too.
    let reloads = store.getState().reloads;
    const stopListening = store.subscribe((state) => {
      if (state.reloads === reloads) {
        return;
      }

      reloads = state.reloads;
      reloadFolder(client, folder);

      if (state.watch.state === 'unavailable') {
        release();
        release = watchFolder(folder, subscriber);
      }
    });

    return () => {
      stopListening();
      release();
    };
  }, [client, enabled, folder]);
}
