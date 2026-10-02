import type { UserId } from '@domain/auth';
import {
  DirectoryNotEmptyError,
  FileChangedError,
  FileNotFoundError,
  FileOperationInvalidError,
  FilePath,
  FileTrailUnavailableError,
  PreconditionRequiredError,
} from '@domain/files';
import type { Etag, FolderNotKeptReason } from '@domain/files';
import type { FileLimits } from './file-limits';
import type { FileWriting } from './file-writing';
import type { HistoryKeeper, KeptBatch } from './history-keeper';
import type { EntryCount, EntryInspection } from './ports/folder-disk.port';
import { checkOptionalIfMatch, confirmSensitive } from './write-preconditions';

/** What deleting sends. */
export interface DeleteEntryCommand {
  readonly folder: string;
  readonly path: string;
  readonly recursive: boolean;
  /** How many entries the person agreed to remove — the count a `409` showed them. */
  readonly expectedEntries: number | null;
  readonly ifMatch: string | null;
  readonly confirmSensitive: boolean;
  /**
   * Keep what goes in the local history first, and answer with it for an undo instead of asking
   * for the count (F8). What does not fit is not deleted at all.
   */
  readonly keepInHistory: boolean;
}

/** What a delete left behind to undo it: the batch it kept, or `null` for a definitive one. */
export interface DeletedEntry {
  readonly kept: KeptBatch | null;
}

/** What a delete is about to remove, once the lock is held and its preconditions passed. */
interface Removal {
  readonly entry: FilePath;
  readonly realPath: string;
  readonly found: EntryInspection;
  readonly version: Etag | null;
  readonly sensitive: boolean;
  readonly userId: UserId;
}

/**
 * Deletes an entry of an open folder — plan 07, B-15.
 *
 * For good, until the local history of F8: so a folder with something in it is not deleted on the
 * first request. It answers `409` with **how much** would go, capped (S-109, S-111), and is deleted
 * only when the request sends that count back; if the count changed in between — Claude created a
 * file — nothing goes, `412` (S-110) ([07 · D-06](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-06--apagar-definitivo-ou-lixeira)).
 *
 * A link is removed and what it points at stays, wherever it is (S-113). The open folder is not
 * deleted from inside itself (S-115). Something already gone is `404`, which the web takes as done
 * when it is the retry of its own delete (S-112).
 *
 * With `keepInHistory` (F8, B-57), the count is not asked: everything that goes is kept first — a
 * file, or every file and folder of a folder, under one batch — and the answer carries the batch for
 * an undo. What does not fit — too many entries, a file past the snapshot ceiling, a history that
 * failed — is not deleted: `428` (`notKept`) for a file, `409` with the count and `notKept` for a
 * folder, and the client takes the definitive step above (S-337). The entry is checked again
 * after keeping and right before it goes; if it changed, nothing goes (`412`).
 */
export class DeleteEntryUseCase {
  /** @param limits how far the count of a folder goes before it says "at least" */
  constructor(
    private readonly writing: FileWriting,
    private readonly limits: Pick<FileLimits, 'deleteCountCap'>,
    private readonly history: HistoryKeeper,
  ) {}

  async execute(command: DeleteEntryCommand, userId: UserId): Promise<DeletedEntry> {
    const { folders, disk, lock } = this.writing;
    const entry = FilePath.create(await folders.resolve(command.folder, userId), command.path);

    if (entry.isFolder) {
      throw new FileOperationInvalidError(entry.relative, 'openFolder');
    }

    const sensitive = confirmSensitive(command.confirmSensitive, entry);
    const realPath = await disk.locate(entry);

    return lock.run(realPath, async () => {
      const found = await disk.inspect(entry);

      if (found === null) {
        throw new FileNotFoundError(entry.relative);
      }

      const version = found.kind === 'file' ? await disk.version(entry) : null;
      checkOptionalIfMatch(entry, command.ifMatch, version);
      const removal = { entry, realPath, found, version, sensitive, userId };

      return command.keepInHistory
        ? { kept: await this.keptThenRemoved(removal) }
        : this.removed(removal, await this.agreedCount(entry, found, command));
    });
  }

  /** The definitive delete of F2: the count the person agreed to, the trail, the disk. */
  private async removed(removal: Removal, count: EntryCount | null): Promise<DeletedEntry> {
    await this.recordedRemoval(removal, count, null);
    return { kept: null };
  }

  /**
   * Everything that goes, kept first; then checked again, and only then removed — recursively,
   * without the count, because what is kept is what the undo brings back (S-344).
   *
   * @throws {PreconditionRequiredError} a file that did not fit the history (`notKept`)
   * @throws {DirectoryNotEmptyError} a folder that did not, with the count and `notKept`
   * @throws {FileChangedError} it changed between keeping and removing — nothing goes
   */
  private async keptThenRemoved(removal: Removal): Promise<KeptBatch> {
    const { entry, realPath, found, userId } = removal;
    const batch = await this.history.keepForDelete(entry, realPath, found, userId);

    if (!batch.kept) {
      throw await this.notKept(entry, found, batch.reason);
    }

    if (!(await this.history.unchanged(entry, realPath, batch))) {
      await this.history.discard(batch, entry.relative);
      throw new FileChangedError(entry.relative, null);
    }

    const inside = { count: batch.entries.length - 1, capped: false };

    try {
      await this.recordedRemoval(removal, found.kind === 'directory' ? inside : null, batch);
    } catch (error) {
      // The trail refused, so nothing was removed: the batch would offer an undo of nothing.
      if (error instanceof FileTrailUnavailableError) {
        await this.history.discard(batch, entry.relative);
      }

      throw error;
    }

    return batch;
  }

  /** The refusal of a delete the history could not take — the client's way to the definitive step. */
  private async notKept(
    entry: FilePath,
    found: EntryInspection,
    reason: FolderNotKeptReason,
  ): Promise<Error> {
    if (found.kind !== 'directory') {
      return new PreconditionRequiredError(
        entry.relative,
        'notKept',
        reason === 'tooLarge' ? 'tooLarge' : 'unavailable',
      );
    }

    const count = await this.writing.disk.count(entry, this.limits.deleteCountCap);

    return new DirectoryNotEmptyError(entry.relative, count.count, count.capped, reason);
  }

  /** The trail first, then the disk; what the delete left, for the watcher. */
  private async recordedRemoval(
    removal: Removal,
    count: EntryCount | null,
    batch: KeptBatch | null,
  ): Promise<void> {
    const { entry, realPath, found, version, sensitive, userId } = removal;

    await this.writing.trail.around(
      {
        userId,
        kind: 'file.deleted',
        target: entry,
        realPath,
        details: {
          ...detailsOf(found, version, count, sensitive),
          ...(batch === null ? {} : { keptBatchId: batch.batchId }),
        },
      },
      () => this.writing.disk.remove(entry, batch !== null || (count?.count ?? 0) > 0),
    );
    this.writing.writes.left(realPath, { kind: 'removed' }, true);
  }

  /**
   * The count of a folder's entries, when the request agreed to it; `null` for anything that is not
   * a folder.
   *
   * @throws {DirectoryNotEmptyError} something is inside, and the request is not recursive
   * @throws {PreconditionRequiredError} recursive, without saying how many entries it agreed to
   * @throws {FileChangedError} the count is not the one the request agreed to
   */
  private async agreedCount(
    entry: FilePath,
    found: EntryInspection,
    command: DeleteEntryCommand,
  ): Promise<EntryCount | null> {
    if (found.kind !== 'directory') {
      return null;
    }

    const count = await this.writing.disk.count(entry, this.limits.deleteCountCap);

    if (count.count === 0) {
      return count;
    }

    if (!command.recursive) {
      throw new DirectoryNotEmptyError(entry.relative, count.count, count.capped);
    }

    if (command.expectedEntries === null) {
      throw new PreconditionRequiredError(entry.relative, 'expectedEntriesMissing');
    }

    if (command.expectedEntries !== count.count) {
      throw new FileChangedError(entry.relative, null);
    }

    return count;
  }
}

function detailsOf(
  found: EntryInspection,
  version: Etag | null,
  count: EntryCount | null,
  sensitive: boolean,
): Readonly<Record<string, unknown>> {
  return {
    entryKind: found.kind,
    sizeBytes: found.kind === 'file' ? found.size : null,
    hash: version?.value ?? null,
    entryCount: count?.count ?? null,
    entryCountCapped: count?.capped ?? null,
    sensitive,
  };
}
