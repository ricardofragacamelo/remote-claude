import { useOpenFolders } from './useOpenFolders';
import { useRecentFolders } from './useRecentFolders';

/**
 * Which folder a screen can be about: the open tabs and the recent folders of the workbench, plus
 * whatever it already has in view (plan 13, B-16, D-16, S-182) — `agentSettings`'s own
 * `FolderPicker`/`ModelsSection` and `mcp`'s own `McpFolderPicker` both offer this choice, so it is
 * declared once, here, in the feature that already owns both lists it combines, rather than in
 * either of the two features that merely use it (which would either duplicate it or close a module
 * cycle between them — plan 13, B-28, D-83).
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
