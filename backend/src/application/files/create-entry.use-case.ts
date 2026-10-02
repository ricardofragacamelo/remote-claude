import type { UserId } from '@domain/auth';
import { Etag, FileExistsError, FilePath } from '@domain/files';
import { encodedWithin, outcomeOf } from './file-writing';
import type { FileWriting } from './file-writing';
import { confirmSensitive } from './write-preconditions';

/** What creating an entry sends. */
export interface CreateEntryCommand {
  readonly folder: string;
  readonly path: string;
  readonly kind: 'file' | 'directory';
  /**
   * The initial contents of a file — what "new from template" and "save as" send, and the server
   * never needs to know it was either ([07 · D-19](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-19--de-onde-vêm-os-modelos)).
   */
  readonly content: string;
  readonly encoding: string;
  readonly bom: boolean;
  readonly confirmSensitive: boolean;
}

/** What was created, and its version when it is a file. */
export interface CreatedEntry {
  readonly path: FilePath;
  readonly etag: Etag | null;
}

/**
 * Creates a file or a folder in an open folder, never over anything — plan 07, B-12.
 *
 * Only if nothing is there: checked under the lock of the path, and enforced again by the disk
 * (`O_EXCL`), so two creates of one path are one `201` and one `409` (S-85). The `409` carries the
 * `ETag` of what is there, which is how a client that lost the answer to its own create recognises
 * the file as the one it sent (S-88). The folders above it that are missing are created too (S-83).
 */
export class CreateEntryUseCase {
  constructor(private readonly writing: FileWriting) {}

  async execute(command: CreateEntryCommand, userId: UserId): Promise<CreatedEntry> {
    const { folders, disk, lock, trail } = this.writing;
    const entry = FilePath.naming(await folders.resolve(command.folder, userId), command.path);
    const sensitive = confirmSensitive(command.confirmSensitive, entry);
    const bytes =
      command.kind === 'file' ? encodedWithin(this.writing, entry.relative, command) : null;
    const realPath = await disk.locate(entry);

    await lock.run(realPath, async () => {
      if ((await disk.inspect(entry)) !== null) {
        throw new FileExistsError(entry.relative, (await disk.version(entry))?.value ?? null);
      }

      await trail.around(
        {
          userId,
          kind: 'file.created',
          target: entry,
          realPath,
          details: {
            entryKind: command.kind,
            sizeBytes: bytes?.length ?? null,
            hash: bytes === null ? null : Etag.of(bytes).value,
            sensitive,
          },
        },
        () => disk.create(entry, bytes),
      );
      this.writing.writes.left(realPath, outcomeOf(bytes === null ? null : Etag.of(bytes)), false);
    });

    return { path: entry, etag: bytes === null ? null : Etag.of(bytes) };
  }
}
