import type { UserId } from '@domain/auth';
import { FilePath } from '@domain/files';
import type { HistoryEntry, HistoryReason } from '@domain/files';
import type { WorkspacePath } from '@domain/workspace';
import { visibleFrom } from './history-entries';
import type { VisibleEntry } from './history-entries';
import type { FileHistoryStore, HistoryScope } from './ports/file-history.port';
import type { FolderDisk } from './ports/folder-disk.port';
import type { FolderResolver } from './ports/folder-resolver.port';

/** What a page of the history is asked. */
export interface ListHistoryQuery {
  readonly folder: string;
  /** One path's versions; `null` for everything under the folder. */
  readonly path: string | null;
  readonly reason: HistoryReason | null;
  /** The recently deleted: the latest delete of each path under the folder that is not there now. */
  readonly deleted: boolean;
  /** The `seq` of the last entry of the previous page; `null` for the first. */
  readonly cursor: number | null;
  readonly limit: number;
}

/** One page, newest first, and where the next starts — `null` on the last. */
export interface HistoryPage {
  readonly entries: readonly VisibleEntry[];
  readonly nextCursor: string | null;
}

/**
 * The local history of a folder — plan 07, B-58: one path's versions, everything under the folder,
 * or what was deleted from it and is not back ([D-17](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local)).
 *
 * Seen by whoever reaches the folder **now** — the resolver asks the allowlist at every request —,
 * whoever wrote each version: a person with the root opened for them already reads the file, and
 * each entry says its author (S-350). The paths come back relative to the folder asked, which may
 * not be the folder the version was written from.
 */
export class ListHistoryUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly disk: FolderDisk,
    private readonly store: FileHistoryStore,
  ) {}

  async execute(query: ListHistoryQuery, userId: UserId): Promise<HistoryPage> {
    const folder = await this.folders.resolve(query.folder, userId);

    if (query.deleted) {
      return this.deletedFrom(folder, query);
    }

    const entries = await this.store.page({
      scope: await this.scopeOf(folder, query.path),
      reason: query.reason,
      before: query.cursor,
      limit: query.limit + 1,
    });

    return pageOf(folder, entries, query.limit);
  }

  /** One path, by its real path — the subject the versions were kept under — or the whole folder. */
  private async scopeOf(folder: WorkspacePath, path: string | null): Promise<HistoryScope> {
    if (path === null) {
      return { kind: 'under', folder: folder.value };
    }

    return { kind: 'path', path: await this.disk.locate(FilePath.create(folder, path)) };
  }

  /**
   * The latest delete of each path, kept only when nothing is there now — read in rounds of the
   * page's size, because the disk, not the store, says what came back.
   */
  private async deletedFrom(folder: WorkspacePath, query: ListHistoryQuery): Promise<HistoryPage> {
    const gone: HistoryEntry[] = [];
    let before = query.cursor;

    while (gone.length <= query.limit) {
      const round = await this.store.latestDeletes(folder.value, before, query.limit + 1);

      for (const entry of round) {
        if (await this.isGone(folder, entry)) {
          gone.push(entry);
        }
      }

      const last = round.at(-1);

      if (last === undefined || round.length <= query.limit) {
        break;
      }

      before = last.seq;
    }

    return pageOf(folder, gone, query.limit);
  }

  private async isGone(folder: WorkspacePath, entry: HistoryEntry): Promise<boolean> {
    const visible = visibleFrom(folder, entry);

    return visible !== null && (await this.disk.inspect(visible.path)) === null;
  }
}

/** The first `limit` entries, and the cursor of the next page when there was one more. */
function pageOf(
  folder: WorkspacePath,
  entries: readonly HistoryEntry[],
  limit: number,
): HistoryPage {
  const shown = entries.slice(0, limit);
  const last = shown.at(-1);

  return {
    entries: shown.flatMap((entry) => visibleFrom(folder, entry) ?? []),
    nextCursor: entries.length > limit && last !== undefined ? String(last.seq) : null,
  };
}
