import { posix } from 'node:path';

import { FilePath, HistoryEntryNotFoundError, hasContents } from '@domain/files';
import type { HistoryEntry } from '@domain/files';
import type { WorkspacePath } from '@domain/workspace';
import type { FileHistoryStore } from './ports/file-history.port';

/** An entry of the history as the caller sees it: from the folder they asked with, **now**. */
export interface VisibleEntry {
  readonly entry: HistoryEntry;
  /** Where it is inside that folder — not the label of the write, whose folder may be another. */
  readonly path: FilePath;
}

/**
 * Where an entry is inside `folder`, or `null` when it is outside — the real path it was kept at,
 * by the one containment rule of the fence ({@link FilePath.staysInside}).
 */
export function visibleFrom(folder: WorkspacePath, entry: HistoryEntry): VisibleEntry | null {
  if (!FilePath.staysInside(folder, entry.path)) {
    return null;
  }

  return { entry, path: FilePath.create(folder, posix.relative(folder.value, entry.path)) };
}

/**
 * One entry, reachable from the folder the caller reaches now — revalidated by the caller's
 * `FolderResolver` at every request (D-17).
 *
 * @throws {HistoryEntryNotFoundError} never ours, purged, or outside the folder — one answer for
 *   the three, because telling them apart would tell the caller it exists (S-341)
 */
export async function reachableEntry(
  store: FileHistoryStore,
  folder: WorkspacePath,
  entryId: string,
): Promise<VisibleEntry> {
  const entry = await store.find(entryId);
  const visible = entry === null ? null : visibleFrom(folder, entry);

  if (visible === null) {
    throw new HistoryEntryNotFoundError(entryId);
  }

  return visible;
}

/**
 * The kept bytes of a file entry.
 *
 * @throws {HistoryEntryNotFoundError} past the snapshot ceiling, or the purge took its blob — not
 *   there, as far as the caller can tell
 */
export async function keptBytesOf(
  store: FileHistoryStore,
  entry: HistoryEntry,
): Promise<Uint8Array> {
  const bytes = hasContents(entry) ? await store.contents(entry) : null;

  if (bytes === null) {
    throw new HistoryEntryNotFoundError(entry.id);
  }

  return bytes;
}
