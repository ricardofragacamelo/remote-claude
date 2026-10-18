import { useOpenFolders, useRecentFolders } from '@/features/workspace';

/**
 * Which folder a section can be about: none — the user's own defaults — or one of the open tabs and
 * the recent folders of the workbench (plan 13, B-16, S-182). The folder goes in the address, so the
 * link reproduces the screen; a folder the address names that is no longer among them still shows.
 */
export function useFolderChoices(current: string | undefined): readonly string[] {
  const open = useOpenFolders();
  const recent = useRecentFolders();
  const paths = [
    ...open.folders.map((folder) => folder.path),
    ...recent.folders.map((folder) => folder.path),
    ...(current === undefined ? [] : [current]),
  ];

  return [...new Set(paths)];
}
