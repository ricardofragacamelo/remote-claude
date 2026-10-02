import type { UserId } from '@domain/auth';
import { FilePath, archiveNaming, outermost } from '@domain/files';
import type { FileTrail } from './file-trail';
import type { TransferLimits } from './file-limits';
import type { ArchiveSource, FolderDisk, OutgoingBytes } from './ports/folder-disk.port';
import type { FolderResolver } from './ports/folder-resolver.port';

/** What `GET /files/archive` asks: one or more paths of an open folder — the selection. */
export interface ArchiveQuery {
  readonly folder: string;
  readonly paths: readonly string[];
}

/** A zip on its way out. */
export interface ArchiveContent {
  /** What the zip is called when saved. */
  readonly fileName: string;
  /** The entries it carries, and the bytes of their files — measured before the first byte. */
  readonly entries: number;
  readonly bytes: number;
  readonly body: OutgoingBytes;
}

/**
 * A folder, or a selection of files and folders, as a zip streamed out — plan 07, B-48.
 *
 * Measured **before the first byte**, so a refusal is a `413` with `params.measure` and not a
 * download that stops at the ceiling ([07 · D-16](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos)):
 * the entries against the zip's ceiling, the bytes against the download's. The walk is the disk's,
 * with the rules of the contract (no link to a folder, nothing outside, nothing D-10 hides below
 * the selection); the names are the domain's, relative to the deepest folder holding every item.
 *
 * Downloading takes contents off the machine: **each** item selected has its `file.downloaded`
 * before the first byte of the zip, and a trail that is down sends nothing
 * ([07 · D-02](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-02--a-escrita-humana-na-trilha)).
 */
export class DownloadArchiveUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly disk: FolderDisk,
    private readonly trail: FileTrail,
    private readonly limits: Pick<TransferLimits, 'archiveMaxEntries' | 'downloadMaxBytes'>,
  ) {}

  async execute(query: ArchiveQuery, userId: UserId): Promise<ArchiveContent> {
    const folder = await this.folders.resolve(query.folder, userId);
    const selection = outermost(query.paths.map((path) => FilePath.create(folder, path)));
    const sources = await this.disk.survey(selection, {
      entries: this.limits.archiveMaxEntries,
      bytes: this.limits.downloadMaxBytes,
    });
    const naming = archiveNaming(
      selection.map((entry) => entry.relative),
      folder.value,
    );

    for (const [index, entry] of selection.entries()) {
      await this.recorded(
        entry,
        sources.filter((source) => source.selection === index),
        userId,
      );
    }

    const body = await this.disk.archive(
      sources.map((source) => ({ ...source, name: naming.nameOf(source.path.relative) })),
    );

    return { fileName: naming.fileName, entries: sources.length, bytes: bytesOf(sources), body };
  }

  /** The `file.downloaded` of one item of the selection: what it is, and what it takes along. */
  private async recorded(
    entry: FilePath,
    under: readonly ArchiveSource[],
    userId: UserId,
  ): Promise<void> {
    await this.trail.record({
      userId,
      kind: 'file.downloaded',
      target: entry,
      realPath: await this.disk.locate(entry),
      details: {
        archive: true,
        entryKind: under[0]?.kind ?? null,
        entries: under.length,
        sizeBytes: bytesOf(under),
      },
    });
  }
}

function bytesOf(sources: readonly ArchiveSource[]): number {
  return sources.reduce((total, source) => total + source.size, 0);
}
