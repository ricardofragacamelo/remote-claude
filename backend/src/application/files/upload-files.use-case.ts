import type { UserId } from '@domain/auth';
import {
  FileChangedError,
  FileExistsError,
  FileNotAFileError,
  FileTrailUnavailableError,
  KEEP_BOTH_ATTEMPTS,
  PreconditionRequiredError,
  UploadSizeMismatchError,
  isWildcard,
  keepBothName,
  touchesSensitive,
} from '@domain/files';
import type { Etag, FilePath } from '@domain/files';
import { DomainError } from '@domain/shared';
import type { TransferLimits } from './file-limits';
import { outcomeOf } from './file-writing';
import type { FileWriting } from './file-writing';
import type { FileKeeping, HistoryKeeper } from './history-keeper';
import type { ChunkSource, EntryInspection, StagedFile } from './ports/folder-disk.port';
import { ensureDirectory, planUpload } from './upload-plan';
import type { DeclaredFile } from './upload-plan';
import { confirmSensitive } from './write-preconditions';

/** What an item does when its name is taken: refuse, replace that version, or take a new name. */
export type ConflictChoice = 'fail' | 'replace' | 'keepBoth';

/** One file of the manifest. */
export interface UploadItem extends DeclaredFile {
  readonly onConflict: ConflictChoice;
  /** The version of the file a `replace` replaces — the one the preflight showed. */
  readonly ifMatch: string | null;
}

/** What `POST /files/upload` declares before its first part. */
export interface UploadCommand {
  readonly folder: string;
  /** Relative to the open folder: where the items go. */
  readonly directory: string;
  readonly items: readonly UploadItem[];
  readonly confirmSensitive: boolean;
}

/** One part of the body, as it arrives. */
export interface UploadPart extends ChunkSource {
  /** Reads what is left of the part and throws it away, so the next part can be reached. */
  skip(): Promise<void>;
}

/** The parts of the body, in the order of the manifest. */
export interface UploadParts {
  /** The next part, or `null` when the body has no more. */
  next(): Promise<UploadPart | null>;
}

/** How one item ended. */
export type UploadOutcome =
  | {
      readonly path: FilePath;
      readonly status: 'created' | 'renamed';
      readonly etag: Etag;
    }
  | {
      readonly path: FilePath;
      readonly status: 'replaced';
      readonly etag: Etag;
      /** How keeping the version it replaced in the local history ended (F8, B-57). */
      readonly history: FileKeeping;
    }
  | { readonly path: FilePath; readonly status: 'failed'; readonly error: DomainError };

/** An item on its way to the disk. */
interface Arrival {
  readonly target: FilePath;
  readonly item: UploadItem;
  readonly staged: StagedFile;
  readonly userId: UserId;
}

/**
 * Files from the person's desktop into an open folder — one, many, or a folder with its structure
 * (plan 07, B-49).
 *
 * Everything the manifest says is checked **before the first byte is written** — the paths, the
 * ceilings, the second step of a sensitive file — and refused whole (`400`, `413`, `428`). Then each
 * item, in order, on its own:
 *
 * 1. a name taken and `fail` → `409` for that item, and its part is skipped unread; `replace`
 *    without the version it replaces, or with another → `428`/`412`, unread too;
 * 2. the bytes go to a temporary of the disk's, hashed as they come — a part that does not carry
 *    what it declared leaves nothing behind;
 * 3. under the lock of the name, the trail is told (`file.created`, or `file.written` for a
 *    replace, with `source: upload`), and only then is the temporary put at its name: `link`, never
 *    over anything, or the atomic replace that asks the version again right before the `rename`;
 *    `keepBoth` tries `name copy.ext`, `name copy 2.ext`… each with `O_EXCL`. A replace keeps the
 *    version it replaces in the local history first (`upload`), under the same lock and before the
 *    trail — and, as in a save, a history that fails does not stop it: the item says so (F8, B-57).
 *
 * An item that fails does not stop the others: the answer is per item (`207`). The trail being down
 * is the exception — before anything was written, the whole upload is a `503`; after, the rest of
 * the items fail with it, untried, because a write the trail cannot take does not happen
 * ([07 · D-02](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-02--a-escrita-humana-na-trilha)).
 */
export class UploadFilesUseCase {
  constructor(
    private readonly writing: FileWriting,
    private readonly limits: TransferLimits,
    private readonly history: HistoryKeeper,
  ) {}

  async execute(
    command: UploadCommand,
    parts: UploadParts,
    userId: UserId,
  ): Promise<readonly UploadOutcome[]> {
    const folder = await this.writing.folders.resolve(command.folder, userId);
    const plan = planUpload(folder, command.directory, command.items, this.limits, 'manifest');

    await ensureDirectory(this.writing.disk, plan.directory);
    confirmSensitive(command.confirmSensitive, ...plan.targets);

    const outcomes: UploadOutcome[] = [];

    for (const [index, item] of command.items.entries()) {
      const target = plan.targets[index] as FilePath;
      const outcome = await this.received(target, item, await parts.next(), userId);

      if (outcome.status === 'failed' && outcome.error instanceof FileTrailUnavailableError) {
        return this.untried(outcomes, plan.targets.slice(index), outcome.error);
      }

      outcomes.push(outcome);
    }

    return outcomes;
  }

  /** One item, from its part to its name — a refusal of a domain rule is that item's outcome. */
  private async received(
    target: FilePath,
    item: UploadItem,
    part: UploadPart | null,
    userId: UserId,
  ): Promise<UploadOutcome> {
    try {
      if (part === null) {
        throw new UploadSizeMismatchError(target.relative, item.size, 0);
      }

      await this.refusedEarly(target, item);

      const staged = await this.writing.disk.stage(target, part, item.size);

      try {
        return await this.placed({ target, item, staged, userId });
      } finally {
        await staged.discard();
      }
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }

      return { path: target, status: 'failed', error };
    } finally {
      await part?.skip();
    }
  }

  /**
   * The trail went down: nothing written yet is a `503` for the whole upload; otherwise what is
   * left fails with it, untried.
   */
  private untried(
    done: readonly UploadOutcome[],
    left: readonly FilePath[],
    error: FileTrailUnavailableError,
  ): readonly UploadOutcome[] {
    if (!done.some((outcome) => outcome.status !== 'failed')) {
      throw error;
    }

    return [...done, ...left.map((path) => ({ path, status: 'failed' as const, error }))];
  }

  /** What can be refused before a byte of the part is read: a name taken, a version missing. */
  private async refusedEarly(target: FilePath, item: UploadItem): Promise<void> {
    const found = await this.writing.disk.inspect(target);

    if (found === null || item.onConflict === 'keepBoth') {
      return;
    }

    if (item.onConflict === 'fail') {
      throw await this.taken(target);
    }

    await this.replaceable(target, item.ifMatch, found);
  }

  /** At its own name if it can be; beside it, under a new one, when that was the choice. */
  private async placed(arrival: Arrival): Promise<UploadOutcome> {
    return (await this.atItsName(arrival)) ?? this.besideIt(arrival);
  }

  /** `null` when the name is taken and the item keeps both. */
  private async atItsName(arrival: Arrival): Promise<UploadOutcome | null> {
    const { target, item } = arrival;
    const realPath = await this.writing.disk.locate(target);

    return this.writing.lock.run(realPath, async () => {
      const found = await this.writing.disk.inspect(target);

      if (found === null) {
        return this.created(arrival, target, realPath, 'created');
      }

      switch (item.onConflict) {
        case 'replace':
          return this.replaced(arrival, realPath, found);
        case 'keepBoth':
          return null;
        default:
          throw await this.taken(target);
      }
    });
  }

  /** `name copy.ext`, `name copy 2.ext`… — the first that is free when the disk links it. */
  private async besideIt(arrival: Arrival): Promise<UploadOutcome> {
    for (let attempt = 1; attempt <= KEEP_BOTH_ATTEMPTS; attempt += 1) {
      const candidate = arrival.target.sibling(keepBothName(arrival.target.name, attempt));
      const placed = await this.ifFree(arrival, candidate);

      if (placed !== null) {
        return placed;
      }
    }

    throw new FileExistsError(arrival.target.relative, null);
  }

  private async ifFree(arrival: Arrival, candidate: FilePath): Promise<UploadOutcome | null> {
    const realPath = await this.writing.disk.locate(candidate);

    return this.writing.lock.run(realPath, async () => {
      if ((await this.writing.disk.inspect(candidate)) !== null) {
        return null;
      }

      try {
        return await this.created(arrival, candidate, realPath, 'renamed');
      } catch (error) {
        // Taken between the look and the `link`: the next name, as if it had been taken before.
        if (error instanceof FileExistsError) {
          return null;
        }

        throw error;
      }
    });
  }

  private async created(
    arrival: Arrival,
    entry: FilePath,
    realPath: string,
    status: 'created' | 'renamed',
  ): Promise<UploadOutcome> {
    const { staged } = arrival;

    await this.writing.trail.around(
      {
        userId: arrival.userId,
        kind: 'file.created',
        target: entry,
        realPath,
        details: {
          entryKind: 'file',
          sizeBytes: staged.size,
          hash: staged.etag.value,
          sensitive: touchesSensitive(entry.relative),
          source: 'upload',
        },
      },
      () => staged.create(entry),
    );
    this.writing.writes.left(realPath, outcomeOf(staged.etag), false);

    return { path: entry, status, etag: staged.etag };
  }

  private async replaced(
    arrival: Arrival,
    realPath: string,
    found: EntryInspection,
  ): Promise<UploadOutcome> {
    const { target, staged } = arrival;
    const before = await this.replaceable(target, arrival.item.ifMatch, found);
    const history = await this.history.keepFile({
      file: target,
      realPath,
      current: before,
      sizeBytes: found.size,
      reason: 'upload',
      userId: arrival.userId,
    });

    await this.writing.trail.around(
      {
        userId: arrival.userId,
        kind: 'file.written',
        target,
        realPath,
        details: {
          sizeBytes: staged.size,
          hashBefore: before.value,
          hashAfter: staged.etag.value,
          sensitive: touchesSensitive(target.relative),
          source: 'upload',
        },
      },
      () =>
        staged.replace(target, (onDisk) => {
          // Somebody wrote between the check and the `rename`: their version stays.
          if (onDisk?.equals(before) !== true) {
            throw new FileChangedError(target.relative, onDisk?.value ?? null);
          }
        }),
    );
    this.writing.writes.left(realPath, outcomeOf(staged.etag), false);

    return { path: target, status: 'replaced', etag: staged.etag, history };
  }

  /**
   * The version a `replace` replaces: a file, named by the item's `If-Match`.
   *
   * @throws {FileNotAFileError} a folder or a device is not replaced by a file
   * @throws {PreconditionRequiredError} no `If-Match`, or `*` — a replace never goes blind
   * @throws {FileChangedError} the file is not the version the preflight showed
   */
  private async replaceable(
    target: FilePath,
    ifMatch: string | null,
    found: EntryInspection,
  ): Promise<Etag> {
    if (found.kind === 'directory' || found.kind === 'other') {
      throw new FileNotAFileError(target.relative);
    }

    if (ifMatch === null || isWildcard(ifMatch)) {
      throw new PreconditionRequiredError(target.relative, 'ifMatchMissing');
    }

    const current = await this.writing.disk.version(target);

    if (current?.matchedBy(ifMatch) !== true) {
      throw new FileChangedError(target.relative, current?.value ?? null);
    }

    return current;
  }

  /** The refusal of a name already taken, with the version of the file there. */
  private async taken(target: FilePath): Promise<FileExistsError> {
    const theirs = await this.writing.disk.version(target);

    return new FileExistsError(target.relative, theirs?.value ?? null);
  }
}
