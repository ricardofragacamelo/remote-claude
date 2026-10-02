import { HistoryKeeper } from '@application/files';
import type {
  FileHistoryStore,
  FolderDisk,
  HistoryPageQuery,
  VersionToKeep,
} from '@application/files';
import { Etag } from '@domain/files';
import type { HistoryEntry } from '@domain/files';
import { FixedClock } from './fixed-clock';
import { SequentialIds } from './sequential-ids';

/**
 * The local history in memory: the rows and the blobs, kept all or nothing as the real store keeps
 * them. `failure` makes every keeping fail with it — the history that is down (S-336, S-337).
 */
export class InMemoryFileHistory implements FileHistoryStore {
  readonly entries: HistoryEntry[] = [];
  readonly blobs = new Map<string, Uint8Array>();
  readonly discarded: string[] = [];
  failure: Error | null = null;
  private seq = 0;

  async keep(versions: readonly VersionToKeep[]): Promise<readonly HistoryEntry[]> {
    if (this.failure !== null) {
      throw this.failure;
    }

    const kept: HistoryEntry[] = [];
    const blobs = new Map<string, Uint8Array>();

    for (const version of versions) {
      kept.push(await this.entryOf(version, blobs));
    }

    blobs.forEach((bytes, hash) => this.blobs.set(hash, bytes));
    this.entries.push(...kept);
    return kept;
  }

  discard(batchId: string): Promise<void> {
    this.discarded.push(batchId);
    this.entries.splice(
      0,
      this.entries.length,
      ...this.entries.filter((entry) => entry.batchId !== batchId),
    );
    return Promise.resolve();
  }

  find(id: string): Promise<HistoryEntry | null> {
    return Promise.resolve(this.entries.find((entry) => entry.id === id) ?? null);
  }

  contents(entry: HistoryEntry): Promise<Uint8Array | null> {
    return Promise.resolve(entry.hash === null ? null : (this.blobs.get(entry.hash) ?? null));
  }

  page(query: HistoryPageQuery): Promise<readonly HistoryEntry[]> {
    const { scope } = query;

    return Promise.resolve(
      this.newestFirst(query.before)
        .filter((entry) =>
          scope.kind === 'path'
            ? entry.path === scope.path
            : entry.path.startsWith(`${scope.folder}/`),
        )
        .filter((entry) => query.reason === null || entry.reason === query.reason)
        .slice(0, query.limit),
    );
  }

  latestDeletes(
    folder: string,
    before: number | null,
    limit: number,
  ): Promise<readonly HistoryEntry[]> {
    const latest = new Map<string, HistoryEntry>();

    for (const entry of this.newestFirst(null)) {
      if (entry.reason === 'delete' && entry.path.startsWith(`${folder}/`)) {
        latest.set(entry.path, latest.get(entry.path) ?? entry);
      }
    }

    return Promise.resolve(
      [...latest.values()]
        .filter((entry) => before === null || entry.seq < before)
        .sort((left, right) => right.seq - left.seq)
        .slice(0, limit),
    );
  }

  private newestFirst(before: number | null): HistoryEntry[] {
    return [...this.entries]
      .filter((entry) => before === null || entry.seq < before)
      .sort((left, right) => right.seq - left.seq);
  }

  private async entryOf(
    version: VersionToKeep,
    blobs: Map<string, Uint8Array>,
  ): Promise<HistoryEntry> {
    const base = {
      id: version.id,
      userId: version.userId,
      path: version.path,
      label: version.label,
      reason: version.reason,
      batchId: version.batchId,
      createdAt: version.createdAt,
    };
    const { contents } = version;
    this.seq += 1;

    if (contents.kind === 'directory') {
      return {
        ...base,
        seq: this.seq,
        entryKind: 'directory',
        hash: null,
        sizeBytes: null,
        kept: 'yes',
      };
    }

    if (contents.kind === 'tooLarge') {
      return {
        ...base,
        seq: this.seq,
        entryKind: 'file',
        hash: contents.hash,
        sizeBytes: contents.sizeBytes,
        kept: 'tooLarge',
      };
    }

    const bytes = await contents.read();
    const hash = Etag.of(bytes).digest;
    blobs.set(hash, bytes);

    return {
      ...base,
      seq: this.seq,
      entryKind: 'file',
      hash,
      sizeBytes: bytes.length,
      kept: 'yes',
    };
  }
}

/** What a history keeper is built with in a test, with the ceilings of the suite's environment. */
export interface KeeperParts {
  readonly store?: InMemoryFileHistory;
  readonly maxFileBytes?: number;
  readonly maxBatchEntries?: number;
  readonly failures?: { error: unknown; path: string }[];
}

/** A keeper over an in-memory store and the disk a test gave it. */
export function aHistoryKeeper(disk: FolderDisk, parts: KeeperParts = {}): HistoryKeeper {
  const failures = parts.failures ?? [];

  return new HistoryKeeper(
    parts.store ?? new InMemoryFileHistory(),
    disk,
    new SequentialIds('01J1000000000000000000'),
    new FixedClock(new Date('2026-10-01T12:00:00.000Z')),
    {
      maxFileBytes: parts.maxFileBytes ?? 65_536,
      maxBatchEntries: parts.maxBatchEntries ?? 1_000,
    },
    (error, path) => {
      failures.push({ error, path });
    },
  );
}
