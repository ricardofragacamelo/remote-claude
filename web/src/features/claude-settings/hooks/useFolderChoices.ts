import { useOpenFolders, useRecentFolders } from '@/features/workspace';

/**
 * The folders a section can be about: the open tabs first, then the recent ones, each once — and
 * the folder of the address, when it is neither (plan 13, B-16).
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
