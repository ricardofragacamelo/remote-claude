import type { UserId } from '@domain/auth';
import {
  Etag,
  FileChangedError,
  FileNotAFileError,
  FilePath,
  PreconditionRequiredError,
  isWildcard,
} from '@domain/files';
import { encodedWithin, outcomeOf, writeOver } from './file-writing';
import type { FileWriting } from './file-writing';
import type { FileKeeping, HistoryKeeper } from './history-keeper';
import { confirmSensitive } from './write-preconditions';

/** What a save sends. */
export interface SaveFileCommand {
  readonly folder: string;
  readonly path: string;
  readonly content: string;
  /** The encoding the file was opened in. */
  readonly encoding: string;
  readonly bom: boolean;
  /** The version the person edited — required, and never `*`. */
  readonly ifMatch: string | null;
  readonly confirmSensitive: boolean;
}

/** A file as the save left it. */
export interface SavedFile {
  readonly path: FilePath;
  readonly etag: Etag;
  readonly size: number;
  /** `false` for a save the disk already held — the retry of a response that got lost (S-66). */
  readonly written: boolean;
  /** How keeping the version it replaced ended; `null` when nothing was written (F8, S-336). */
  readonly history: FileKeeping | null;
}

/**
 * Saves a file of an open folder **without ever losing Claude's work** — plan 07, B-11.
 *
 * The rules, in the order they run ([07 · D-03](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)):
 *
 * 1. a file that changes what Claude may do needs the explicit confirmation (S-79);
 * 2. `If-Match` is required, and `*` is not a version (S-63) — `428`;
 * 3. the text has to fit the encoding and the ceiling (S-73, S-76) — nothing touched otherwise;
 * 4. under the lock of the file's real path — the undo of a session writes there too (S-125):
 *    - the disk already holds exactly this → `200`, nothing written, nothing in the trail (S-66);
 *    - the disk holds another version, or nothing → `412` with the current one (S-64, S-68). A file
 *      Claude removed is never re-created in silence;
 *    - the version about to be replaced goes to the local history — and a history that fails does
 *      not stop the save, the answer says so (F8, S-336);
 *    - the trail first, then the atomic write, which checks the version once more right before its
 *      rename, against writers outside this process.
 *
 * Exported by the module: plan 11's replace-in-files and plan 13's `CLAUDE.md` write through this,
 * and inherit the `ETag`, the trail and the atomicity rather than writing their own.
 */
export class SaveFileUseCase {
  constructor(
    private readonly writing: FileWriting,
    private readonly history: HistoryKeeper,
  ) {}

  async execute(command: SaveFileCommand, userId: UserId): Promise<SavedFile> {
    const { folders, disk, lock } = this.writing;
    const file = FilePath.create(await folders.resolve(command.folder, userId), command.path);
    const sensitive = confirmSensitive(command.confirmSensitive, file);

    if (command.ifMatch === null || isWildcard(command.ifMatch)) {
      throw new PreconditionRequiredError(file.relative, 'ifMatchMissing');
    }

    const bytes = encodedWithin(this.writing, file.relative, command);
    const realPath = await disk.locate(file);
    const ifMatch = command.ifMatch;

    return lock.run(realPath, () =>
      this.replace({ file, realPath, bytes, ifMatch, sensitive, userId, command }),
    );
  }

  private async replace(save: {
    readonly file: FilePath;
    readonly realPath: string;
    readonly bytes: Uint8Array;
    readonly ifMatch: string;
    readonly sensitive: boolean;
    readonly userId: UserId;
    readonly command: SaveFileCommand;
  }): Promise<SavedFile> {
    const { file, bytes } = save;
    const next = Etag.of(bytes);
    const onDisk = await this.currentVersion(file);
    const current = onDisk?.version ?? null;

    if (current?.equals(next) === true) {
      return { path: file, etag: next, size: bytes.length, written: false, history: null };
    }

    if (onDisk === null || current === null || !current.matchedBy(save.ifMatch)) {
      throw new FileChangedError(file.relative, current?.value ?? null);
    }

    const history = await this.history.keepFile({
      file,
      realPath: save.realPath,
      current,
      sizeBytes: onDisk.size,
      reason: 'save',
      userId: save.userId,
    });

    const written = await this.writing.trail.around(
      {
        userId: save.userId,
        kind: 'file.written',
        target: file,
        realPath: save.realPath,
        details: {
          sizeBytes: bytes.length,
          hashBefore: current.value,
          hashAfter: next.value,
          encoding: save.command.encoding,
          sensitive: save.sensitive,
        },
      },
      () => writeOver(this.writing.disk, file, bytes, current),
    );
    this.writing.writes.left(save.realPath, outcomeOf(next), false);

    return { path: file, etag: next, size: written.size, written: true, history };
  }

  /**
   * The version on disk and its size, `null` when nothing is there; a folder or a device is not
   * saved over.
   */
  private async currentVersion(
    file: FilePath,
  ): Promise<{ readonly version: Etag | null; readonly size: number } | null> {
    const found = await this.writing.disk.inspect(file);

    if (found === null) {
      return null;
    }

    if (found.kind === 'directory' || found.kind === 'other') {
      throw new FileNotAFileError(file.relative);
    }

    return { version: await this.writing.disk.version(file), size: found.size };
  }
}
