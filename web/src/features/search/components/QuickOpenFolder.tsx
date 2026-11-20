import { useMountedQuickOpenFolder } from '../hooks/useQuickOpenFolder';

/**
 * Marks the folder tab on screen for Quick Open (plan 11, B-14) — the palette's own mode component
 * gets no folder prop, the same gap `RecentFilesMode` has in the editor. Renders nothing; the host
 * keeps it up beside the shell of the tab, same as `PanelCommands`.
 */
export function QuickOpenFolder({ folder }: { readonly folder: string }): null {
  useMountedQuickOpenFolder(folder);
  return null;
}
