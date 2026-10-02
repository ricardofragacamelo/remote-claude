import type { UserId } from '@domain/auth';
import { Etag, FilePath } from '@domain/files';
import type { FileLimits } from './file-limits';
import type { FolderDisk } from './ports/folder-disk.port';
import type { FolderResolver } from './ports/folder-resolver.port';
import type { TextCodec } from './ports/text-codec.port';
import { decodeText } from './text-content';
import type { DecodedText } from './text-content';

/** What opening a file asks. */
export interface ReadFileQuery {
  readonly folder: string;
  readonly path: string;
  /** "Reopen with encoding"; `null` to detect. */
  readonly encoding: string | null;
  /** The `If-None-Match` the client sent, or `null`. */
  readonly ifNoneMatch: string | null;
}

/** A file, opened. */
export interface OpenedFile extends DecodedText {
  readonly kind: 'opened';
  readonly path: FilePath;
  readonly etag: Etag;
  readonly size: number;
  readonly mtime: Date;
  /** Past the threshold of the light mode of the editor (S-43). */
  readonly largeFile: boolean;
}

/** The client already has this version: a `304`, with no body (S-52). */
export interface UnchangedFile {
  readonly kind: 'notModified';
  readonly etag: Etag;
}

/**
 * The contents of one file of an open folder — plan 07, B-09.
 *
 * Read from one descriptor, up to the ceiling and one byte past it, and the `ETag` is the hash of
 * **those** bytes ([07 · D-03](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)).
 * A version the client already holds answers `304` before anything is decoded: that is what makes
 * revalidating every tab of a folder tab cheap when the person comes back to it.
 *
 * Reading is not in the trail — the volume would be every click on the tree, and what a person
 * reads on their own machine is not the risk the trail exists for. It is in the log, without the
 * contents ([ADR-015](../../../../docs/architecture/shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web)).
 */
export class ReadFileUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly disk: FolderDisk,
    private readonly codec: TextCodec,
    private readonly limits: Pick<FileLimits, 'largeFileBytes' | 'maxEditBytes'>,
  ) {}

  async execute(query: ReadFileQuery, userId: UserId): Promise<OpenedFile | UnchangedFile> {
    const file = FilePath.create(await this.folders.resolve(query.folder, userId), query.path);
    const { bytes, mtime } = await this.disk.read(file, this.limits.maxEditBytes);
    const etag = Etag.of(bytes);

    if (query.ifNoneMatch !== null && etag.notModifiedFor(query.ifNoneMatch)) {
      return { kind: 'notModified', etag };
    }

    return {
      kind: 'opened',
      path: file,
      etag,
      size: bytes.length,
      mtime,
      largeFile: bytes.length > this.limits.largeFileBytes,
      ...decodeText(file.relative, bytes, query.encoding, this.codec),
    };
  }
}
