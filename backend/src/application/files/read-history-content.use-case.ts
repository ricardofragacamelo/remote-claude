import type { UserId } from '@domain/auth';
import { Etag, FileNotAFileError } from '@domain/files';
import type { FileLimits } from './file-limits';
import { keptBytesOf, reachableEntry } from './history-entries';
import type { FileHistoryStore } from './ports/file-history.port';
import type { FolderResolver } from './ports/folder-resolver.port';
import type { TextCodec } from './ports/text-codec.port';
import type { OpenedFile } from './read-file.use-case';
import { decodeText } from './text-content';

/** What reading a kept version asks. */
export interface ReadHistoryContentQuery {
  readonly folder: string;
  readonly entryId: string;
  /** "Reopen with encoding"; `null` to detect. */
  readonly encoding: string | null;
}

/**
 * The text of a kept version — plan 07, B-58: what the Timeline compares with the current file.
 *
 * The same answer as opening a file, decoded by the same rules (`decodeText`), so the diff tab
 * treats a version exactly as it treats the file. A folder of a delete has no text (`422`); a
 * version past the snapshot ceiling, or whose blob the purge took, is not there (`404`), and
 * neither is one outside the folder the caller reaches now (S-341). Reading is not in the trail,
 * as reading a file is not.
 */
export class ReadHistoryContentUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly store: FileHistoryStore,
    private readonly codec: TextCodec,
    private readonly limits: Pick<FileLimits, 'largeFileBytes'>,
  ) {}

  async execute(query: ReadHistoryContentQuery, userId: UserId): Promise<OpenedFile> {
    const folder = await this.folders.resolve(query.folder, userId);
    const { entry, path } = await reachableEntry(this.store, folder, query.entryId);

    if (entry.entryKind === 'directory') {
      throw new FileNotAFileError(path.relative);
    }

    const bytes = await keptBytesOf(this.store, entry);

    return {
      kind: 'opened',
      path,
      etag: Etag.of(bytes),
      size: bytes.length,
      mtime: entry.createdAt,
      largeFile: bytes.length > this.limits.largeFileBytes,
      ...decodeText(path.relative, bytes, query.encoding, this.codec),
    };
  }
}
