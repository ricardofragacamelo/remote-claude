import { and, desc, eq, gt, inArray, like, lt, lte, max, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type {
  FileHistoryStore,
  HistoryLimits,
  HistoryPageQuery,
  HistoryScope,
  VersionToKeep,
} from '@application/files';
import { Etag, hasContents, storeCutoff } from '@domain/files';
import type { HistoryEntry } from '@domain/files';
import type { Transaction } from '@infra/database/connection';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { fileHistoryEntries as entries } from '@infra/database/schema';
import type { HistoryBlobDirectory } from '@adapter/outbound/filesystem/history-blob.directory';
import { lockForTransaction } from '../advisory-lock';
import { runLogged } from '../query-logging';
import { toEntity } from './file-history-entry.mapper';

type EntryInsert = typeof entries.$inferInsert;

/**
 * The one lock of the history: a keeping takes it **shared**, so keepings never wait on each other;
 * the purge takes it **exclusive**, so its sweep never runs beside a keeping that wrote a blob and
 * has not inserted the row that names it yet.
 */
const HISTORY_LOCK = ['file_history_entries'] as const;

const DAY_MS = 86_400_000;

/** What one purge removed: rows past the retention, past the ceiling per path, past the total; blobs. */
export interface HistoryPurge {
  readonly aged: number;
  readonly trimmed: number;
  readonly overCeiling: number;
  readonly swept: number;
}

/**
 * The local history in PostgreSQL and on the backend's disk — plan 07, B-56
 * ([D-17](../../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local)).
 *
 * The rows are metadata; the contents are blobs of {@link HistoryBlobDirectory}, written **inside**
 * the keeping's transaction, under the shared lock, before the row that names them — a keeping that
 * fails halfway rolls its rows back and leaves, at most, a blob nobody names, which the next sweep
 * removes. Keeping a version trims the versions of its path past the ceiling per file, the oldest
 * first; the purge does that for every path, and the retention, and the total of the **distinct**
 * blobs — and only then sweeps, so a blob another entry still names is never removed (S-331).
 *
 * Two purges at once — the job and a direct call — serialise on the exclusive lock: the second
 * finds what the first left, and neither removes a row twice nor misses one (S-334).
 *
 * Who sees an entry is not this class's question: reads are by id, by path or by folder, never by
 * user, because whoever reaches the folder now may read it, and the use cases ask the resolver.
 */
export class DrizzleFileHistoryStore implements FileHistoryStore {
  constructor(
    private readonly context: PersistenceContext,
    private readonly blobs: HistoryBlobDirectory,
    private readonly limits: Pick<HistoryLimits, 'maxPerFile' | 'maxStoreBytes' | 'retentionDays'>,
  ) {}

  async keep(versions: readonly VersionToKeep[]): Promise<readonly HistoryEntry[]> {
    if (versions.length === 0) {
      return [];
    }

    return this.context.db.transaction(async (tx) => {
      await lockForTransaction(tx, this.context.logger, 'fileHistory.lock', HISTORY_LOCK, 'shared');

      const rows: EntryInsert[] = [];

      for (const version of versions) {
        rows.push(await this.rowOf(version));
      }

      const inserted = await runLogged(
        this.context.logger,
        'fileHistory.insert',
        tx.insert(entries).values(rows).returning(),
      );

      await this.trimmed(tx, inArray(entries.path, [...new Set(rows.map((row) => row.path))]));

      return inserted.map(toEntity).sort((left, right) => left.seq - right.seq);
    });
  }

  async discard(batchId: string): Promise<void> {
    await runLogged(
      this.context.logger,
      'fileHistory.discard',
      this.context.db.delete(entries).where(eq(entries.batchId, batchId)),
    );
  }

  async find(id: string): Promise<HistoryEntry | null> {
    const [row] = await runLogged(
      this.context.logger,
      'fileHistory.find',
      this.context.db.select().from(entries).where(eq(entries.id, id)).limit(1),
    );

    return row === undefined ? null : toEntity(row);
  }

  async contents(entry: HistoryEntry): Promise<Uint8Array | null> {
    return hasContents(entry) ? this.blobs.read(String(entry.hash)) : null;
  }

  async page(query: HistoryPageQuery): Promise<readonly HistoryEntry[]> {
    const rows = await runLogged(
      this.context.logger,
      'fileHistory.page',
      this.context.db
        .select()
        .from(entries)
        .where(
          and(
            scopeOf(query.scope),
            query.reason === null ? undefined : eq(entries.reason, query.reason),
            query.before === null ? undefined : lt(entries.seq, query.before),
          ),
        )
        .orderBy(desc(entries.seq))
        .limit(query.limit),
    );

    return rows.map(toEntity);
  }

  async latestDeletes(
    folder: string,
    before: number | null,
    limit: number,
  ): Promise<readonly HistoryEntry[]> {
    const latest = this.context.db
      .selectDistinctOn([entries.path])
      .from(entries)
      .where(and(eq(entries.reason, 'delete'), under(folder)))
      .orderBy(entries.path, desc(entries.seq))
      .as('latest');
    const rows = await runLogged(
      this.context.logger,
      'fileHistory.latestDeletes',
      this.context.db
        .select()
        .from(latest)
        .where(before === null ? undefined : lt(latest.seq, before))
        .orderBy(desc(latest.seq))
        .limit(limit),
    );

    return rows.map(toEntity);
  }

  /** One pass of the purge, under the exclusive lock: age, per path, total, and then the sweep. */
  async purge(): Promise<HistoryPurge> {
    return this.context.db.transaction(async (tx) => {
      await lockForTransaction(tx, this.context.logger, 'fileHistory.purgeLock', HISTORY_LOCK);

      const aged = await this.aged(tx);
      const trimmed = await this.trimmed(tx, undefined);
      const overCeiling = await this.overCeiling(tx);
      const swept = await this.blobs.sweep(await this.named(tx));

      return { aged, trimmed, overCeiling, swept };
    });
  }

  /** The row of a version — and, for a file, its blob, written first (S-329, S-330). */
  private async rowOf(version: VersionToKeep): Promise<EntryInsert> {
    const { contents } = version;
    const row = {
      id: version.id,
      userId: version.userId.value,
      path: version.path,
      label: version.label,
      reason: version.reason,
      batchId: version.batchId,
      createdAt: version.createdAt,
    };

    if (contents.kind === 'directory') {
      return { ...row, entryKind: 'directory', hash: null, sizeBytes: null, kept: 'yes' };
    }

    if (contents.kind === 'tooLarge') {
      return {
        ...row,
        entryKind: 'file',
        hash: contents.hash,
        sizeBytes: contents.sizeBytes,
        kept: 'tooLarge',
      };
    }

    const bytes = await contents.read();
    const hash = Etag.of(bytes).digest;

    await this.blobs.put(hash, bytes);
    return { ...row, entryKind: 'file', hash, sizeBytes: bytes.length, kept: 'yes' };
  }

  /** Every entry of a path past the newest `maxPerFile`, within `scope` — the oldest go. */
  private async trimmed(tx: Transaction, scope: SQL | undefined): Promise<number> {
    const ranked = tx
      .select({
        id: entries.id,
        rank: sql<number>`row_number() over (partition by ${entries.path} order by ${entries.seq} desc)`.as(
          'rank',
        ),
      })
      .from(entries)
      .where(scope)
      .as('ranked');
    const removed = await runLogged(
      this.context.logger,
      'fileHistory.trim',
      tx
        .delete(entries)
        .where(
          inArray(
            entries.id,
            tx
              .select({ id: ranked.id })
              .from(ranked)
              .where(gt(ranked.rank, this.limits.maxPerFile)),
          ),
        )
        .returning({ id: entries.id }),
    );

    return removed.length;
  }

  /** Every entry older than the retention (S-332). */
  private async aged(tx: Transaction): Promise<number> {
    const cutoff = new Date(
      this.context.clock.now().getTime() - this.limits.retentionDays * DAY_MS,
    );
    const removed = await runLogged(
      this.context.logger,
      'fileHistory.age',
      tx.delete(entries).where(lt(entries.createdAt, cutoff)).returning({ id: entries.id }),
    );

    return removed.length;
  }

  /** The oldest kept entries, until the distinct blobs that are left fit the total (S-331). */
  private async overCeiling(tx: Transaction): Promise<number> {
    const blobs = await runLogged(
      this.context.logger,
      'fileHistory.blobs',
      tx
        .select({ sizeBytes: max(entries.sizeBytes), newestSeq: max(entries.seq) })
        .from(entries)
        .where(KEPT_FILE)
        .groupBy(entries.hash),
    );
    const cutoff = storeCutoff(
      blobs.map((blob) => ({
        sizeBytes: Number(blob.sizeBytes),
        newestSeq: Number(blob.newestSeq),
      })),
      this.limits.maxStoreBytes,
    );

    if (cutoff === null) {
      return 0;
    }

    const removed = await runLogged(
      this.context.logger,
      'fileHistory.overCeiling',
      tx
        .delete(entries)
        .where(and(KEPT_FILE, lte(entries.seq, cutoff)))
        .returning({ id: entries.id }),
    );

    return removed.length;
  }

  /** Every hash a row still names — what the sweep must leave. */
  private async named(tx: Transaction): Promise<ReadonlySet<string>> {
    const rows = await runLogged(
      this.context.logger,
      'fileHistory.named',
      tx.selectDistinct({ hash: entries.hash }).from(entries).where(KEPT_FILE),
    );

    return new Set(rows.map((row) => String(row.hash)));
  }
}

/** The entries whose contents are a blob. */
const KEPT_FILE = and(eq(entries.kept, 'yes'), eq(entries.entryKind, 'file'));

function scopeOf(scope: HistoryScope): SQL {
  return scope.kind === 'path' ? eq(entries.path, scope.path) : under(scope.folder);
}

/**
 * Every entry under a folder: a prefix `LIKE` on the real path, with the separator, so `/a/b` never
 * takes `/a/bc` in — and the pattern's own characters escaped, since a folder may be named `100%`.
 */
function under(folder: string): SQL {
  const prefix = folder.endsWith('/') ? folder : `${folder}/`;

  return like(entries.path, `${prefix.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
}
