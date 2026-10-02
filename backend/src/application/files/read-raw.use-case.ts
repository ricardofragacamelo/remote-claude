import type { UserId } from '@domain/auth';
import {
  FilePath,
  FileTooLargeError,
  RangeNotSatisfiableError,
  contentTypeOf,
  isPreviewable,
  rangeOf,
} from '@domain/files';
import type { Etag } from '@domain/files';
import type { FileTrail } from './file-trail';
import type { TransferLimits } from './file-limits';
import type { FolderDisk, OutgoingBytes, RawFile } from './ports/folder-disk.port';
import type { FolderResolver } from './ports/folder-resolver.port';
import type { VersionCache } from './version-cache';
import { checkOptionalIfMatch } from './write-preconditions';

/** What `GET /files/raw` asks. */
export interface ReadRawQuery {
  readonly folder: string;
  readonly path: string;
  /** The `Range` header, or `null`. */
  readonly range: string | null;
  /** The `If-Match` of the second page on: the version the first one was of. */
  readonly ifMatch: string | null;
  /** To be saved, not shown — and then it is in the trail. */
  readonly download: boolean;
}

/** The bytes of a file, the part asked for, and what to say about them. */
export interface RawContent {
  readonly path: FilePath;
  readonly etag: Etag;
  /** Of the whole file. */
  readonly size: number;
  /** Read from the bytes, never from the extension — and never `text/html`. */
  readonly contentType: string;
  /** Shown where it is opened (`inline`) — only a type on the preview list, and never a download. */
  readonly inline: boolean;
  /** The part sent, both ends inclusive; `null` for the whole file. */
  readonly range: { readonly start: number; readonly end: number } | null;
  /** How many bytes {@link body} carries. */
  readonly length: number;
  readonly body: OutgoingBytes;
}

/**
 * The raw bytes of a file of an open folder — the previews, the hexadecimal view, the paginated
 * read, and the download (plan 07, B-48).
 *
 * Through the same fence as the editor's read, from **one** descriptor: the version, the first bytes
 * the type is read from, and the bytes sent are all of the same file. The rules, in order:
 *
 * 1. `If-Match` that does not name the version → `412` with the current one: a page of another
 *    version would be stitched to the ones before it (07 · B-51);
 * 2. one range → that part; several, or none → the whole file; past the end → `416`;
 * 3. what is sent past the download ceiling → `413` — a page always fits, the whole of a large file
 *    may not ([07 · D-16](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos));
 * 4. a download is in the trail **before the first byte** — and a trail that is down sends nothing
 *    (`503`). A preview or a page is a read: in the log, never in the trail
 *    ([07 · D-02](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-02--a-escrita-humana-na-trilha)).
 *
 * Whatever refuses, the descriptor is closed before the refusal leaves.
 */
export class ReadRawUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly disk: FolderDisk,
    private readonly trail: FileTrail,
    private readonly versions: VersionCache,
    private readonly limits: Pick<TransferLimits, 'downloadMaxBytes'>,
  ) {}

  async execute(query: ReadRawQuery, userId: UserId): Promise<RawContent> {
    const file = FilePath.create(await this.folders.resolve(query.folder, userId), query.path);
    const raw = await this.disk.openRaw(file);

    try {
      return await this.serve(file, raw, query, userId);
    } catch (error) {
      await raw.close();
      throw error;
    }
  }

  private async serve(
    file: FilePath,
    raw: RawFile,
    query: ReadRawQuery,
    userId: UserId,
  ): Promise<RawContent> {
    const etag = await this.versions.of(raw);

    checkOptionalIfMatch(file, query.ifMatch, etag);

    const range = partOf(file, raw.size, query.range);
    const [start, end] = range === null ? [0, raw.size - 1] : [range.start, range.end];
    const length = end - start + 1;

    if (length > this.limits.downloadMaxBytes) {
      throw new FileTooLargeError(file.relative, length, this.limits.downloadMaxBytes, 'bytes');
    }

    const contentType = contentTypeOf(raw.head, raw.head.length >= raw.size);

    if (query.download) {
      await this.trail.record({
        userId,
        kind: 'file.downloaded',
        target: file,
        realPath: raw.realPath,
        details: { sizeBytes: length, hash: etag.value, range, archive: false },
      });
    }

    return {
      path: file,
      etag,
      size: raw.size,
      contentType,
      inline: !query.download && isPreviewable(contentType),
      range,
      length,
      body: raw.bytes(start, end),
    };
  }
}

/**
 * The part a `Range` names, `null` for the whole file.
 *
 * @throws {RangeNotSatisfiableError} it starts past the end
 */
function partOf(
  file: FilePath,
  size: number,
  header: string | null,
): { readonly start: number; readonly end: number } | null {
  const asked = rangeOf(header, size);

  switch (asked.kind) {
    case 'unsatisfiable':
      throw new RangeNotSatisfiableError(file.relative, size);
    case 'part':
      return { start: asked.start, end: asked.end };
    default:
      return null;
  }
}
