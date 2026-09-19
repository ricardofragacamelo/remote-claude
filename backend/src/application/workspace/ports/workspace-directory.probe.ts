/** What the filesystem says about one path. */
export type DirectoryInspection =
  | { readonly kind: 'missing' }
  | { readonly kind: 'present'; readonly realPath: string; readonly isDirectory: boolean };

/**
 * The only filesystem question the `workspace` module asks at request time.
 *
 * It answers the **real** path — every symlink resolved — because the containment rule has to run
 * against what will actually be opened. A symlink sitting inside an allowed root and pointing
 * outside it is the classic way past a path check, and comparing the name instead of the target
 * is how it gets past (S-12).
 *
 * It is a port and not a call to `node:fs` inside the use case, so the rule can be exercised
 * without a filesystem — and so the one place that touches the disk is visible.
 */
export interface WorkspaceDirectoryProbe {
  inspect(path: string): Promise<DirectoryInspection>;
}

export const WORKSPACE_DIRECTORY_PROBE = Symbol('WorkspaceDirectoryProbe');
