import { create } from 'zustand';

/**
 * Which root the person picked.
 *
 * It is a store and not component state because the choice outlives the selector: the session
 * screen needs it after the selector has been unmounted, and passing it down through the shell
 * would make every layer in between know about workspaces.
 */
export interface WorkspaceSelection {
  /** The chosen path, or `null` while nothing has been chosen. */
  readonly selected: string | null;
  select(path: string | null): void;
}

export const useWorkspaceStore = create<WorkspaceSelection>((set) => ({
  selected: null,
  select: (selected) => set({ selected }),
}));
