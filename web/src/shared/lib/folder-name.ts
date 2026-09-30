/**
 * What a person calls a folder: the last segment of its path — or the path itself, for `/`.
 *
 * Shared because three places name folders — the service of the tabs and recent folders, the tabs,
 * and the question of closing them — and a folder called differently in two of them is a bug.
 */
export function folderName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || path;
}
