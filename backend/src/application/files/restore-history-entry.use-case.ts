import type { UserId } from '@domain/auth';
import { Etag, FileChangedError, FileExistsError, isWildcard } from '@domain/files';
import type { FilePath, HistoryEntry } from '@domain/files';
import { outcomeOf, writeOver } from './file-writing';
import type { FileWriting } from './file-writing';
import { keptBytesOf, reachableEntry } from './history-entries';
import type { FileKeeping, HistoryKeeper } from './history-keeper';
import type { FileHistoryStore } from './ports/file-history.port';
import type { EntryInspection } from './ports/folder-disk.port';
import { confirmSensitive } from './write-preconditions';

/** What restoring a version sends. */
export interface RestoreEntryCommand {
  readonly folder: string;
  readonly entryId: string;
  /**
   * The current version, to replace it; `null` to re-create what was deleted. `*` names no version
   * and is taken as `null` — a restore never overwrites blind.
   */
  readonly ifMatch: string | null;
  readonly confirmSensitive: boolean;
}

/** What a restore left: a file and its version, or a folder (`etag` and `size` `null`). */
export interface RestoredEntry {
  readonly path: FilePath;
  readonly etag: Etag | null;
  readonly size: number | null;
  /** `false` when the disk already held exactly this — the second restore of one entry (S-342). */
  readonly written: boolean;
  /** How keeping the version it replaced ended; `null` when nothing was replaced. */
  readonly history: FileKeeping | null;
}

/** One restore, once the entry is found and the lock is held. */
interface Restoring {
  readonly entry: HistoryEntry;
  readonly path: FilePath;
  readonly realPath: string;
  /** The kept bytes of a file; `null` for a folder. */
  readonly bytes: Uint8Array | null;
  readonly sensitive: boolean;
  readonly userId: UserId;
}

/**
 * Puts a version of the local history back — plan 07, B-58. An ordinary write
 * ([D-17](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local)):
 *
 * - **with `If-Match`**, it replaces the current file, and only that version of it: `412` with the
 *   one on disk when it changed — Claude included (S-339) —; the current one is kept first
 *   (`restore`), so the restore can itself be undone (S-338);
 * - **without**, it re-creates what was deleted, with the folders above it, through the fence: `409`
 *   when the path was taken since (S-340). A folder of a delete is re-created even empty, and one
 *   already there is a success — the undo of a batch restores its folders before what is in them;
 * - the disk already holding exactly this is `200` without writing or recording (S-342);
 * - `file.restored` goes in the trail **before** the disk (S-343), and a trail that is down writes
 *   nothing.
 */
export class RestoreHistoryEntryUseCase {
  constructor(
    private readonly writing: FileWriting,
    private readonly store: FileHistoryStore,
    private readonly history: HistoryKeeper,
  ) {}

  async execute(command: RestoreEntryCommand, userId: UserId): Promise<RestoredEntry> {
    const { folders, disk, lock } = this.writing;
    const folder = await folders.resolve(command.folder, userId);
    const { entry, path } = await reachableEntry(this.store, folder, command.entryId);
    const sensitive = confirmSensitive(command.confirmSensitive, path);
    const bytes = entry.entryKind === 'file' ? await keptBytesOf(this.store, entry) : null;
    const realPath = await disk.locate(path);
    const ifMatch =
      command.ifMatch === null || isWildcard(command.ifMatch) ? null : command.ifMatch;
    const restoring = { entry, path, realPath, bytes, sensitive, userId };

    return lock.run(realPath, () =>
      bytes === null || ifMatch === null
        ? this.recreate(restoring)
        : this.replace({ ...restoring, bytes }, ifMatch),
    );
  }

  /** Over the current file, named by `If-Match` — kept first. */
  private async replace(
    restoring: Restoring & { readonly bytes: Uint8Array },
    ifMatch: string,
  ): Promise<RestoredEntry> {
    const { path, bytes } = restoring;
    const next = Etag.of(bytes);
    const found = await this.writing.disk.inspect(path);
    const current = found === null ? null : await this.writing.disk.version(path);

    if (current?.equals(next) === true) {
      return { path, etag: next, size: bytes.length, written: false, history: null };
    }

    if (found === null || current === null || !current.matchedBy(ifMatch)) {
      throw new FileChangedError(path.relative, current?.value ?? null);
    }

    const history = await this.history.keepFile({
      file: path,
      realPath: restoring.realPath,
      current,
      sizeBytes: found.size,
      reason: 'restore',
      userId: restoring.userId,
    });

    await this.recorded(restoring, current, () =>
      writeOver(this.writing.disk, path, bytes, current),
    );

    return { path, etag: next, size: bytes.length, written: true, history };
  }

  /** Where nothing is — or, already there, exactly what is being restored. */
  private async recreate(restoring: Restoring): Promise<RestoredEntry> {
    const { path, bytes } = restoring;
    const next = bytes === null ? null : Etag.of(bytes);
    const found = await this.writing.disk.inspect(path);
    const done = { path, etag: next, size: bytes?.length ?? null, history: null };

    if (found !== null) {
      const there = await this.writing.disk.version(path);

      if (isAlready(found, there, next)) {
        return { ...done, written: false };
      }

      throw new FileExistsError(path.relative, there?.value ?? null);
    }

    await this.recorded(restoring, null, () => this.writing.disk.create(path, bytes));

    return { ...done, written: true };
  }

  /** The trail first, then the disk; what the restore left, for the watcher. */
  private async recorded(
    restoring: Restoring,
    replaced: Etag | null,
    write: () => Promise<unknown>,
  ): Promise<void> {
    const { entry, path, realPath, bytes } = restoring;
    const next = bytes === null ? null : Etag.of(bytes);

    await this.writing.trail.around(
      {
        userId: restoring.userId,
        kind: 'file.restored',
        target: path,
        realPath,
        details: {
          entryId: entry.id,
          entryKind: entry.entryKind,
          reason: entry.reason,
          sizeBytes: bytes?.length ?? null,
          hashBefore: replaced?.value ?? null,
          hashAfter: next?.value ?? null,
          replaced: replaced !== null,
          sensitive: restoring.sensitive,
        },
      },
      write,
    );
    this.writing.writes.left(realPath, outcomeOf(next), false);
  }
}

/** Whether what is at the path is already the restored entry: the same bytes, or a folder. */
function isAlready(found: EntryInspection, there: Etag | null, next: Etag | null): boolean {
  return next === null ? found.kind === 'directory' : there?.equals(next) === true;
}
