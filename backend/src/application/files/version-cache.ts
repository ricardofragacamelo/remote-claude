import type { Etag } from '@domain/files';
import type { Clock } from '@domain/shared';
import type { RawFile } from './ports/folder-disk.port';

/** How many versions are remembered — one per file being paged through is all it is for. */
export const VERSION_CACHE_ENTRIES = 1024;

/**
 * How recent a change is too recent to remember the version by: a write in the same tick of the
 * filesystem's clock as the one that was hashed leaves the same size and the same times, and only
 * the bytes differ — the "racy git" problem, answered as git answers it, by not trusting a stat
 * that young. Such a file is hashed again at every read until its change ages past this.
 */
export const RACY_CHANGE_MS = 2000;

/**
 * The versions of the files the raw route served, by the identity of each file — plan 07, B-48.
 *
 * The `ETag` of `raw` is the same SHA-256 of the bytes as the one of `content`
 * ([07 · D-03](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)),
 * and a hexadecimal view pages through a binary of gigabytes a few kilobytes at a time: hashing it
 * whole at every page would read it whole at every page. So the hash is remembered by what changes
 * whenever the bytes can — device, inode, size, and the modification and change times in
 * nanoseconds — and a page of a file that did not change costs a `fstat`. Bounded, the least
 * recently used going first, and in memory: a restart only costs one hash per file.
 */
export class VersionCache {
  private readonly versions = new Map<string, Etag>();

  constructor(
    private readonly clock: Clock,
    private readonly maxEntries: number = VERSION_CACHE_ENTRIES,
  ) {}

  /** The version of an open file: remembered, or hashed from its descriptor and remembered. */
  async of(file: RawFile): Promise<Etag> {
    const known = this.versions.get(file.identity);

    if (known !== undefined) {
      this.versions.delete(file.identity);
      this.versions.set(file.identity, known);
      return known;
    }

    const version = await file.digest();

    if (this.clock.now().getTime() - file.changedAt.getTime() >= RACY_CHANGE_MS) {
      this.remember(file.identity, version);
    }

    return version;
  }

  /** How many versions are remembered now. */
  get size(): number {
    return this.versions.size;
  }

  private remember(identity: string, version: Etag): void {
    this.versions.set(identity, version);

    if (this.versions.size > this.maxEntries) {
      // A map iterates in insertion order, and a hit is re-inserted: the first key is the coldest.
      // Past the ceiling the map holds at least one key, so the first is always there.
      this.versions.delete(this.versions.keys().next().value as string);
    }
  }
}
