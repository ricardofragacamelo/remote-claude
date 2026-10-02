import type { FileHistoryStore, HistoryPageQuery, VersionToKeep } from '@application/files';
import type { HistoryEntry } from '@domain/files';

/**
 * The real local history, with a switch that makes its keeping fail — the store out for one
 * request, and back for the next (S-336, S-337). Reads always go through: what the failure is about
 * is a version that could not be kept.
 */
export class SwitchableFileHistory implements FileHistoryStore {
  failure: Error | null = null;

  constructor(private readonly delegate: FileHistoryStore) {}

  keep(versions: readonly VersionToKeep[]): Promise<readonly HistoryEntry[]> {
    return this.failure === null ? this.delegate.keep(versions) : Promise.reject(this.failure);
  }

  discard(batchId: string): Promise<void> {
    return this.delegate.discard(batchId);
  }

  find(id: string): Promise<HistoryEntry | null> {
    return this.delegate.find(id);
  }

  contents(entry: HistoryEntry): Promise<Uint8Array | null> {
    return this.delegate.contents(entry);
  }

  page(query: HistoryPageQuery): Promise<readonly HistoryEntry[]> {
    return this.delegate.page(query);
  }

  latestDeletes(
    folder: string,
    before: number | null,
    limit: number,
  ): Promise<readonly HistoryEntry[]> {
    return this.delegate.latestDeletes(folder, before, limit);
  }
}
