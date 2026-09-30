import { useCallback, useEffect, useRef, useState } from 'react';

import { useOpenFolders } from '@/features/workspace';
import type { OpenFolder } from '@/features/workspace';
import type { AppError } from '@/shared/api/errors';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { isReconnecting, useConnectionChange } from '@/shared/hooks/useConnectionStatus';
import { folderName } from '@/shared/lib/folder-name';
import { forgetFolderTab } from '../store/folder-tab.store';
import { pruneTabs } from '../store/tab-state';
import type { FolderTab } from '../types/workbench';
import { writeLastFolder } from './last-folder';
import { useAllowlistNotices } from './useAllowlistNotices';

/** Where the tabs lead: the route's to perform, since a feature never learns the router exists. */
export interface FolderTabsRoutes {
  /** The folder of the active tab — the URL's. The workbench is never on screen without one. */
  readonly active: string;

  /** Puts a folder on screen. Has to be stable across renders. */
  onActivate(path: string): void;

  /** No tab is left: back to the welcome screen. Has to be stable across renders. */
  onWelcome(): void;
}

/** The folder tabs, and everything that can be done to them. */
export interface FolderTabs {
  readonly tabs: readonly FolderTab[];
  readonly active: string;

  /** The tab on screen — among the tabs always, kept by the server or not yet. */
  readonly current: FolderTab;
  readonly isLoading: boolean;
  readonly error: AppError | null;
  reload(): void;

  activate(path: string): void;

  /** The tabs a confirmation is being asked for, or `null` while none is. */
  readonly closing: readonly string[] | null;

  /** Asks to close these tabs — the confirmation says their sessions carry on. */
  askClose(paths: readonly string[]): void;
  cancelClose(): void;
  confirmClose(): void;
  readonly isClosing: boolean;

  /** Why the last change to the tabs was refused, until the next one is tried. */
  readonly failure: AppError | null;

  /** One place to the left (`-1`) or to the right (`1`). */
  move(path: string, by: -1 | 1): void;

  /** To an index — where a drag let go of it. */
  moveTo(path: string, index: number): void;
}

function tabOf(folder: OpenFolder): FolderTab {
  return {
    path: folder.path,
    name: folderName(folder.path),
    rootLabel: folder.rootLabel,
    state: folder.state,
    kept: true,
  };
}

/**
 * The tab that is on screen once `closed` go: the neighbour to the right, else the one to the left,
 * else none (plan 06, S-102).
 */
export function neighbourAfter(
  tabs: readonly string[],
  active: string,
  closed: readonly string[],
): string | null {
  const at = tabs.indexOf(active);
  const remaining = (candidates: readonly string[]) =>
    candidates.find((path) => !closed.includes(path)) ?? null;

  return remaining(tabs.slice(at + 1)) ?? remaining([...tabs.slice(0, Math.max(at, 0))].reverse());
}

/** The order with one tab taken out and put back at `index`. */
function withMoved(order: readonly string[], path: string, index: number): readonly string[] {
  const rest = order.filter((each) => each !== path);
  const at = Math.min(Math.max(index, 0), rest.length);

  return [...rest.slice(0, at), path, ...rest.slice(at)];
}

/**
 * The folder tabs: the set and the order the **server** keeps, and the active one the **URL** says
 * ([06 · D-10](../../../../../docs/plans/06-workbench/decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas)).
 *
 * - A folder the address names that the server does not have yet shows as a tab at the end — it is
 *   being opened (S-103), or the server refused to keep it (S-183), and it is on screen either way.
 * - Closing asks first, and says the folder's Claude sessions carry on: they live in the backend
 *   (S-101). Closing the active tab puts its neighbour on screen, and the last one the welcome
 *   screen (S-102). A second click on "close" while the first is on its way closes nothing more
 *   (S-109).
 * - The set is read again when the window comes back **and** when the socket does: another window
 *   may have opened or closed one meanwhile, and the two converge on the server's (S-107).
 * - Moving is never optimistic: the server says, then the tabs are read again.
 * - What this browser kept of a folder that is no longer open — closed in another window, on
 *   another device — is dropped once the tabs are read (S-135); a folder with an open tab that stops
 *   being allowed is told as a notification (06 · D-17).
 */
export function useFolderTabs({ active, onActivate, onWelcome }: FolderTabsRoutes): FolderTabs {
  const folders = useOpenFolders();
  const { close, reorder, reload } = folders;
  const [closing, setClosing] = useState<readonly string[] | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [failure, setFailure] = useState<AppError | null>(null);

  // A ref, not the state above: two clicks in the same tick both read the state from before either.
  const busy = useRef(false);

  const kept = folders.folders.map(tabOf);
  const current: FolderTab = kept.find((tab) => tab.path === active) ?? {
    path: active,
    name: folderName(active),
    rootLabel: null,
    state: 'available',
    kept: false,
  };
  const tabs = current.kept ? kept : [...kept, current];
  const order = tabs.map((tab) => tab.path);

  useEffect(() => {
    writeLastFolder(active);
  }, [active]);

  const loaded = !folders.isLoading && folders.error === null;
  const open = order.join('\n');

  useEffect(() => {
    if (loaded) {
      pruneTabs(open.split('\n'));
    }
  }, [loaded, open]);

  useAllowlistNotices(folders.folders);

  useReloadOnReconnect(reload);

  const confirmClose = useCallback(() => {
    if (closing === null || busy.current) {
      return;
    }

    busy.current = true;
    setIsClosing(true);
    setFailure(null);
    const next =
      active !== null && closing.includes(active) ? neighbourAfter(order, active, closing) : active;

    void (async () => {
      try {
        for (const path of closing) {
          await close(path);
          forgetFolderTab(path);
        }
        setClosing(null);
        if (next === null) {
          onWelcome();
        } else if (next !== active) {
          onActivate(next);
        }
      } catch (error) {
        setFailure(error as AppError);
      } finally {
        busy.current = false;
        setIsClosing(false);
      }
    })();
  }, [active, close, closing, onActivate, onWelcome, order]);

  const moveTo = useCallback(
    (path: string, index: number) => {
      const current = kept.map((tab) => tab.path);

      if (!current.includes(path) || current.indexOf(path) === index) {
        return;
      }

      setFailure(null);
      reorder(withMoved(current, path, index)).catch((error: unknown) => {
        setFailure(error as AppError);
      });
    },
    [kept, reorder],
  );

  return {
    tabs,
    active,
    current,
    isLoading: folders.isLoading,
    error: folders.error,
    reload,
    activate: onActivate,
    closing,
    askClose: (paths) => {
      if (paths.length > 0) {
        setFailure(null);
        setClosing(paths);
      }
    },
    cancelClose: () => {
      if (!busy.current) {
        setClosing(null);
      }
    },
    confirmClose,
    isClosing,
    failure,
    move: (path, by) => {
      moveTo(path, kept.findIndex((tab) => tab.path === path) + by);
    },
    moveTo,
  };
}

/**
 * Reads the tabs again when the socket comes back from a drop — what another window did while this
 * one was cut off is on the server, and this window has not seen it (plan 06, S-107).
 */
function useReloadOnReconnect(reload: () => void): void {
  useConnectionChange(
    useCallback(
      (was: ConnectionStatus, now: ConnectionStatus) => {
        if (now === 'ready' && isReconnecting(was)) {
          reload();
        }
      },
      [reload],
    ),
  );
}
