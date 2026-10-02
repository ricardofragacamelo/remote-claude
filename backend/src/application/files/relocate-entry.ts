import type { UserId } from '@domain/auth';
import {
  FileExistsError,
  FileNotFoundError,
  FileOperationInvalidError,
  FilePath,
} from '@domain/files';
import type { EntryKind, Etag } from '@domain/files';
import { outcomeOf } from './file-writing';
import type { FileWriting } from './file-writing';
import type { EntryInspection } from './ports/folder-disk.port';
import { checkOptionalIfMatch, confirmSensitive, underLocks } from './write-preconditions';

/** What moving or copying sends. */
export interface RelocateCommand {
  readonly folder: string;
  readonly from: string;
  readonly to: string;
  readonly ifMatch: string | null;
  readonly confirmSensitive: boolean;
}

/** An entry at its new place, what it is, and its version when it is a file. */
export interface RelocatedEntry {
  readonly path: FilePath;
  readonly kind: EntryKind;
  readonly etag: Etag | null;
}

/** Everything a move or a copy has checked by the time it reaches the disk. */
export interface Relocation {
  readonly userId: UserId;
  readonly source: FilePath;
  readonly target: FilePath;
  readonly sourceRealPath: string;
  readonly targetRealPath: string;
  readonly found: EntryInspection;
  readonly version: Etag | null;
  readonly sensitive: boolean;
}

/**
 * What a move and a copy share: the two paths, the checks that come before the disk, and the locks.
 *
 * - the open folder itself is never the source (S-93), and a folder never goes into itself
 *   (S-92, S-106);
 * - a destination outside the open folder is refused by {@link FilePath} before any I/O (S-94);
 * - under the locks of **both** real paths: the source has to be there (S-97), match the
 *   `If-Match` when one was sent (S-98), and the destination has to be free — never overwritten
 *   (S-91, S-102). A destination that is the source itself under another case is free (S-99);
 * - the trail, with both paths, **before** the disk.
 */
export class EntryRelocator {
  constructor(private readonly writing: FileWriting) {}

  /**
   * @param kind the fact of the trail — a move or a copy
   * @param act the one thing that differs between the two: what the disk is asked to do
   */
  async relocate(
    command: RelocateCommand,
    userId: UserId,
    kind: 'file.moved' | 'file.copied',
    act: (relocation: Relocation) => Promise<void>,
  ): Promise<RelocatedEntry> {
    const relocation = await this.checked(command, userId);

    return relocation(async (checked) => {
      await this.writing.trail.around(
        {
          userId,
          kind,
          target: checked.source,
          realPath: checked.sourceRealPath,
          details: {
            from: checked.source.relative,
            to: checked.target.relative,
            entryKind: checked.found.kind,
            hash: checked.version?.value ?? null,
            sensitive: checked.sensitive,
          },
        },
        () => act(checked),
      );
      this.remember(kind, checked);

      return { path: checked.target, kind: checked.found.kind, etag: checked.version };
    });
  }

  /**
   * What the move or the copy left, for the watcher's origin: the destination — a file's bytes when
   * they were hashed, anything under a folder — and, for a move, nothing at the source.
   */
  private remember(kind: 'file.moved' | 'file.copied', checked: Relocation): void {
    const folder = checked.found.kind === 'directory';

    this.writing.writes.left(checked.targetRealPath, outcomeOf(checked.version), folder);

    if (kind === 'file.moved') {
      this.writing.writes.left(checked.sourceRealPath, { kind: 'removed' }, folder);
    }
  }

  /** The checks before the locks, and a way to run the rest under them. */
  private async checked(
    command: RelocateCommand,
    userId: UserId,
  ): Promise<<T>(work: (relocation: Relocation) => Promise<T>) => Promise<T>> {
    const folder = await this.writing.folders.resolve(command.folder, userId);
    const source = FilePath.create(folder, command.from, 'from');
    const target = FilePath.naming(folder, command.to, 'to');

    if (source.isFolder) {
      throw new FileOperationInvalidError(source.relative, 'openFolder');
    }

    if (source.contains(target)) {
      throw new FileOperationInvalidError(target.relative, 'intoItself');
    }

    const sensitive = confirmSensitive(command.confirmSensitive, source, target);
    const sourceRealPath = await this.writing.disk.locate(source);
    const targetRealPath = await this.writing.disk.locate(target);

    return (work) =>
      underLocks(this.writing.lock, [sourceRealPath, targetRealPath], async () => {
        const found = await this.writing.disk.inspect(source);

        if (found === null) {
          throw new FileNotFoundError(source.relative);
        }

        const version = await this.versionOf(source, found, command.ifMatch);
        checkOptionalIfMatch(source, command.ifMatch, version);
        await this.ensureFree(target, found);

        return work({
          userId,
          source,
          target,
          sourceRealPath,
          targetRealPath,
          found,
          version,
          sensitive,
        });
      });
  }

  /**
   * The version of a file, hashed when it is small enough to be opened in the editor or when the
   * request names one; a folder and a link have none.
   */
  private async versionOf(
    source: FilePath,
    found: EntryInspection,
    ifMatch: string | null,
  ): Promise<Etag | null> {
    if (
      found.kind !== 'file' ||
      (ifMatch === null && found.size > this.writing.limits.maxEditBytes)
    ) {
      return null;
    }

    return this.writing.disk.version(source);
  }

  private async ensureFree(target: FilePath, source: EntryInspection): Promise<void> {
    const there = await this.writing.disk.inspect(target);

    if (there !== null && there.identity !== source.identity) {
      throw new FileExistsError(
        target.relative,
        (await this.writing.disk.version(target))?.value ?? null,
      );
    }
  }
}
