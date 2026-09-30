import { create } from 'zustand';

import type { Workspace } from '../types/workspace';

/** Where a folder picked from a menu or the palette goes — the route's to perform. */
export interface FolderRoutes {
  /** Opens a folder in the workbench. */
  open(path: string): void;

  /** The welcome screen: every recent folder, and the roots. */
  welcome(): void;
}

export interface FolderDialogState {
  readonly open: boolean;

  /** The root to start inside, or `null` to start on the roots. */
  readonly startAt: Workspace | null;

  /** Set by the host of the dialog while it is mounted. */
  readonly routes: FolderRoutes | null;

  /** Opens "Open folder" — from a button, a shortcut, the File menu or the palette. */
  show(startAt?: Workspace | null): void;
  setOpen(open: boolean): void;
}

/**
 * The one "Open folder" dialog of the app, and where it starts.
 *
 * One, and not one per screen: the command that opens it is in the File menu and the palette on
 * every screen, and it has to open the same dialog wherever it is run from.
 */
export const useFolderDialog = create<FolderDialogState>((set) => ({
  open: false,
  startAt: null,
  routes: null,

  show: (startAt = null) => {
    set({ open: true, startAt });
  },
  setOpen: (open) => {
    set(open ? { open } : { open, startAt: null });
  },
}));
