/** The query of a folder, when there is one — every route that reads a folder's override takes it. */
export function withFolder(path: string, folder: string | undefined): string {
  return folder === undefined ? path : `${path}?${new URLSearchParams({ folder }).toString()}`;
}
