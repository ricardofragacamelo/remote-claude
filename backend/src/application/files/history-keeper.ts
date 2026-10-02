import { posix } from 'node:path';

import type { UserId } from '@domain/auth';
import { FileTooLargeError, keptFor } from '@domain/files';
import type {
  EntryKind,
  Etag,
  FilePath,
  FolderNotKeptReason,
  HistoryEntry,
  HistoryReason,
  NotKeptReason,
  TreeChild,
} from '@domain/files';
import type { Clock, IdGenerator } from '@domain/shared';
import type { HistoryLimits } from './file-limits';
import type { FileHistoryStore, KeptContents, VersionToKeep } from './ports/file-history.port';
import type { EntryInspection, FolderDisk } from './ports/folder-disk.port';

/**
 * What a failure of the history could not stop, reported rather than thrown — the `warn` of a save
 * that went ahead without its version kept (S-336). A callback, because `application/` has no logger.
 */
export type HistoryFailureReporter = (error: unknown, path: string) => void;

/** How keeping one file before a write ended: the entry, or why there is none to go back to. */
export type FileKeeping =
  | { readonly kept: true; readonly entryId: string }
  | { readonly kept: false; readonly reason: NotKeptReason };

/** A delete's items in the history, all of them, under one batch — what its undo restores. */
export interface KeptBatch {
  readonly kept: true;
  readonly batchId: string;
  readonly entries: readonly HistoryEntry[];
  /** What the entry was when it was kept, to tell whether it changed before it is removed. */
  readonly fingerprint: string;
}

/** How keeping before a delete ended: everything, or nothing and why. */
export type BatchKeeping =
  KeptBatch | { readonly kept: false; readonly reason: FolderNotKeptReason };

/** A version that is about to be lost, as the write that loses it knows it. */
export interface VersionAtRisk {
  readonly file: FilePath;
  readonly realPath: string;
  /** The version on disk, already hashed by the write's own precondition. */
  readonly current: Etag;
  readonly sizeBytes: number;
  readonly reason: Exclude<HistoryReason, 'delete'>;
  readonly userId: UserId;
}

/** What a delete may keep and an undo re-create: a file, a folder — never a link or a device. */
const RESTORABLE: ReadonlySet<EntryKind> = new Set(['file', 'directory']);

/** One entry inside a folder about to be deleted, as the walk found it. */
interface Walked {
  readonly file: FilePath;
  readonly realPath: string;
  readonly kind: 'file' | 'directory';
  /** `kind:relative:size:mtime` — what tells the folder changed between keeping and removing. */
  readonly mark: string;
}

/**
 * Keeps, **before** a write of the person's, the version it is about to lose — plan 07, B-57
 * ([D-17](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local)).
 *
 * Two promises, and they differ on purpose. Before a save, a restore or an upload that replaces,
 * the history is comfort: a failure is reported and the write goes ahead, and the answer says that
 * version did not enter (S-336). Before a delete, it is what replaces the confirmation with an undo:
 * everything is kept or nothing is, and the delete does not go ahead on "nothing"
 * ([D-06](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-06--apagar-definitivo-ou-lixeira), S-337).
 *
 * Only the person's writes come through here; Claude's never do — they have the undo of the session.
 */
export class HistoryKeeper {
  constructor(
    private readonly store: FileHistoryStore,
    private readonly disk: FolderDisk,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly limits: Pick<HistoryLimits, 'maxFileBytes' | 'maxBatchEntries'>,
    private readonly reportFailure: HistoryFailureReporter,
  ) {}

  /**
   * Keeps the version a save, a restore or an upload is about to replace. Never throws: past the
   * snapshot ceiling the entry says `tooLarge` (S-333), and a store that fails is reported (S-336).
   */
  async keepFile(version: VersionAtRisk): Promise<FileKeeping> {
    try {
      if (keptFor(version.sizeBytes, this.limits.maxFileBytes) === 'yes') {
        const entryId = await this.keptUnlessGrown(version);

        if (entryId !== null) {
          return { kept: true, entryId };
        }
      }

      await this.store.keep([this.versionOf(version, null, this.tooLarge(version))]);
      return { kept: false, reason: 'tooLarge' };
    } catch (error) {
      this.reportFailure(error, version.file.relative);
      return { kept: false, reason: 'unavailable' };
    }
  }

  /**
   * Keeps everything a delete is about to remove — a file, or a folder with every file and folder
   * inside it — under one batch, or nothing (S-335, S-337). A link, a device, a name that is not
   * UTF-8 cannot be put back, so a delete that reaches one is not kept either.
   */
  async keepForDelete(
    entry: FilePath,
    realPath: string,
    found: EntryInspection,
    userId: UserId,
  ): Promise<BatchKeeping> {
    try {
      const walked = await this.walk(entry, realPath, found);

      if (typeof walked === 'string') {
        return { kept: false, reason: walked };
      }

      const batchId = this.ids.next();
      const entries = await this.store.keep(
        walked.map((item) =>
          this.versionOf(
            { file: item.file, realPath: item.realPath, reason: 'delete', userId },
            batchId,
            this.contentsOf(item),
          ),
        ),
      );

      return { kept: true, batchId, entries, fingerprint: fingerprintOf(found, walked, entries) };
    } catch (error) {
      if (error instanceof FileTooLargeError) {
        return { kept: false, reason: 'tooLarge' };
      }

      this.reportFailure(error, entry.relative);
      return { kept: false, reason: 'unavailable' };
    }
  }

  /**
   * Whether the entry is still what was kept — the walk of a folder, the hash of a file — right
   * before it is removed. Claude writes without the person's lock; a file it created in between is
   * not in the batch, and would go without a way back.
   */
  async unchanged(entry: FilePath, realPath: string, batch: KeptBatch): Promise<boolean> {
    const found = await this.disk.inspect(entry);

    if (found?.kind === 'file') {
      return fileMark((await this.disk.version(entry))?.digest) === batch.fingerprint;
    }

    const walked = found === null ? null : await this.walk(entry, realPath, found);

    return Array.isArray(walked) && marksOf(walked) === batch.fingerprint;
  }

  /** Forgets a batch whose delete did not go ahead. Never throws: the sweep catches what is left. */
  async discard(batch: KeptBatch, path: string): Promise<void> {
    try {
      await this.store.discard(batch.batchId);
    } catch (error) {
      this.reportFailure(error, path);
    }
  }

  /** The bytes, kept, and the entry's id — `null` when the file grew past the ceiling since. */
  private async keptUnlessGrown(version: VersionAtRisk): Promise<string | null> {
    const kept = this.versionOf(version, null, {
      kind: 'file',
      read: () => this.bytesOf(version.file),
    });

    try {
      await this.store.keep([kept]);
      return kept.id;
    } catch (error) {
      if (error instanceof FileTooLargeError) {
        return null;
      }

      throw error;
    }
  }

  private tooLarge(version: VersionAtRisk): KeptContents {
    return { kind: 'tooLarge', hash: version.current.digest, sizeBytes: version.sizeBytes };
  }

  private contentsOf(item: Walked): KeptContents {
    return item.kind === 'directory'
      ? { kind: 'directory' }
      : { kind: 'file', read: () => this.bytesOf(item.file) };
  }

  private async bytesOf(file: FilePath): Promise<Uint8Array> {
    return (await this.disk.read(file, this.limits.maxFileBytes)).bytes;
  }

  private versionOf(
    version: Pick<VersionAtRisk, 'file' | 'realPath' | 'userId'> & { reason: HistoryReason },
    batchId: string | null,
    contents: KeptContents,
  ): VersionToKeep {
    return {
      id: this.ids.next(),
      userId: version.userId,
      path: version.realPath,
      label: version.file.relative,
      reason: version.reason,
      batchId,
      createdAt: this.clock.now(),
      contents,
    };
  }

  /**
   * Everything a delete would remove, the entry first and every folder before what is in it — the
   * order an undo re-creates them in — or why it cannot all be kept. Never through a link: a link
   * inside stops the keeping, it is not followed.
   */
  private async walk(
    entry: FilePath,
    realPath: string,
    found: EntryInspection,
  ): Promise<readonly Walked[] | FolderNotKeptReason> {
    if (found.kind === 'file') {
      return keptFor(found.size, this.limits.maxFileBytes) === 'yes'
        ? [{ file: entry, realPath, kind: 'file', mark: '' }]
        : 'tooLarge';
    }

    if (found.kind !== 'directory') {
      return 'unavailable';
    }

    return this.walkFolder(entry, realPath);
  }

  private async walkFolder(
    root: FilePath,
    realPath: string,
  ): Promise<readonly Walked[] | FolderNotKeptReason> {
    const walked: Walked[] = [{ file: root, realPath, kind: 'directory', mark: '' }];
    const pending: FilePath[] = [root];

    for (let folder = pending.shift(); folder !== undefined; folder = pending.shift()) {
      const budget = this.limits.maxBatchEntries - walked.length;
      const level = await this.disk.list(folder, budget + 1);

      if (level.children.length > budget) {
        return 'tooMany';
      }

      for (const child of level.children) {
        const refusal = this.refusalOf(child);

        if (refusal !== null) {
          return refusal;
        }

        const file = folder.child(child.name);
        const kind = child.kind === 'directory' ? 'directory' : 'file';
        const relative = posix.relative(root.relative, file.relative);

        walked.push({
          file,
          realPath: posix.join(realPath, relative),
          kind,
          mark: `${kind}:${relative}:${String(child.size)}:${String(child.mtime.getTime())}`,
        });

        if (kind === 'directory') {
          pending.push(file);
        }
      }
    }

    return walked;
  }

  /**
   * Why one child cannot be kept, or `null` when it can. A name with a backslash is one no route
   * of this API can write back (`FilePath` refuses it), so it is not kept as if it could be.
   */
  private refusalOf(child: TreeChild): FolderNotKeptReason | null {
    if (child.unreadableName || child.name.includes('\\') || !RESTORABLE.has(child.kind)) {
      return 'unavailable';
    }

    return child.kind === 'file' && keptFor(child.size, this.limits.maxFileBytes) === 'tooLarge'
      ? 'tooLarge'
      : null;
  }
}

/**
 * What was kept, as one string: the hash of a file, or the marks of a folder's entries — kinds,
 * paths, sizes and modification times — which {@link HistoryKeeper.unchanged} compares with the disk.
 */
function fingerprintOf(
  found: EntryInspection,
  walked: readonly Walked[],
  entries: readonly HistoryEntry[],
): string {
  return found.kind === 'file'
    ? fileMark(entries.map((entry) => entry.hash).join())
    : marksOf(walked);
}

function fileMark(hash: string | undefined): string {
  return `file:${String(hash)}`;
}

function marksOf(walked: readonly Walked[]): string {
  return walked
    .map((item) => item.mark)
    .sort()
    .join('\n');
}
