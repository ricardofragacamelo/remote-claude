/**
 * One writer per file at a time, inside this process.
 *
 * The person's save (`files`) and the undo's restore (`session`) both write by `rename`, in the same
 * process. Without this, the two could interleave on one file and the disk would end with whichever
 * rename landed last over a hash the other had checked — with it, the disk always ends with one
 * whole version, and the `ETag` says which (plan 07, B-18, S-125).
 *
 * Keyed by the **real** path, so a symlink and its target are one file. A writer outside this
 * process — the CLI of Claude writes straight to the disk — does not take it; that window is
 * declared in plan 07, R-01, and covered by the hash check right before the rename.
 *
 * A port in `shared` because two modules take it and neither may import the other; the
 * infrastructure provides the one instance both get.
 */
export interface PathLock {
  /**
   * Runs `work` once nobody else holds `realPath`, and releases it however `work` ends — a write
   * that fails releases the lock too (S-127).
   */
  run<T>(realPath: string, work: () => Promise<T>): Promise<T>;
}

export const PATH_LOCK = Symbol('PathLock');
