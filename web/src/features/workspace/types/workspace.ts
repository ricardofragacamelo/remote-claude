/** A root this installation will let Claude run in, as the screen knows it. */
export interface Workspace {
  /** Absolute path, with every symlink already resolved by the backend. */
  readonly path: string;
  readonly label: string;
  /** ISO-8601, or `null` when this user has never opened anything under it. */
  readonly lastUsedAt: string | null;
}
