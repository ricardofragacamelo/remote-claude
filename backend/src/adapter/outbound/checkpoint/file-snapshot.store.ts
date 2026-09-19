import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** What a file held before a turn touched it, or why nothing was kept. */
export type Snapshot =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'captured';
      readonly blobPath: string;
      readonly hash: string;
      readonly sizeBytes: number;
    }
  | { readonly kind: 'tooLarge'; readonly sizeBytes: number }
  | { readonly kind: 'unreadable' };

/** How much disk the snapshot store may use, and how big one snapshot may be. */
export interface SnapshotLimits {
  /** Files above this are not snapshotted, and the checkpoint records that they were not. */
  readonly maxFileBytes: number;

  /** How much the whole store may hold before the oldest snapshots are purged. */
  readonly maxStoreBytes: number;
}

/**
 * The previous contents of files, on disk.
 *
 * On disk and not in PostgreSQL: a snapshot of a large file in the database is a database that
 * grows with somebody's repository. The row keeps the metadata and points here. The reference
 * measurement is small — the CLI's own store holds 6.6 MB for 54 sessions — and small without a
 * ceiling still grows, which is what the limits are for.
 */
export class FileSnapshotStore {
  constructor(
    private readonly root: string,
    private readonly limits: SnapshotLimits,
  ) {}

  /**
   * Keeps what the path holds right now.
   *
   * A file that is not there is `absent`, and that is information rather than a failure: it is
   * what lets undo **delete** a file the turn created, instead of leaving it behind because
   * there was nothing to restore.
   *
   * A file above the limit is recorded as `tooLarge` and not kept. The undo then knows it cannot
   * promise that path — which is the honest outcome, and much better than discovering it at the
   * moment somebody asks for their work back.
   */
  async capture(sessionId: string, promptId: string, filePath: string): Promise<Snapshot> {
    let content: Buffer;

    try {
      const stats = await stat(filePath);

      if (stats.size > this.limits.maxFileBytes) {
        return { kind: 'tooLarge', sizeBytes: stats.size };
      }

      content = await readFile(filePath);
    } catch (error) {
      return isAbsent(error) ? { kind: 'absent' } : { kind: 'unreadable' };
    }

    const hash = digestOf(content);
    const blobPath = this.blobPathFor(sessionId, promptId, filePath, hash);

    await mkdir(path.dirname(blobPath), { recursive: true });
    await writeFile(blobPath, content);

    return { kind: 'captured', blobPath, hash, sizeBytes: content.byteLength };
  }

  /** The hash and size of what is at a path now, or `null` when there is nothing there. */
  async measure(
    filePath: string,
  ): Promise<{ hash: string; mtime: Date; sizeBytes: number } | null> {
    try {
      const [content, stats] = await Promise.all([readFile(filePath), stat(filePath)]);

      return { hash: digestOf(content), mtime: stats.mtime, sizeBytes: stats.size };
    } catch {
      return null;
    }
  }

  /**
   * Drops the oldest sessions until the store is under its ceiling.
   *
   * `live` names the sessions a purge may not touch: a session that is still running can still be
   * asked to undo, and purging underneath it would take away the only copy of somebody's file
   * while they were still working on it.
   *
   * @returns the sessions it removed
   */
  async purge(live: ReadonlySet<string>): Promise<string[]> {
    const sessions = await this.sessionsBySize();
    const total = sessions.reduce((sum, entry) => sum + entry.bytes, 0);

    let remaining = total;
    const removed: string[] = [];

    for (const session of sessions) {
      if (remaining <= this.limits.maxStoreBytes) {
        break;
      }
      if (live.has(session.id)) {
        continue;
      }

      await rm(path.join(this.root, session.id), { recursive: true, force: true });
      remaining -= session.bytes;
      removed.push(session.id);
    }

    return removed;
  }

  /** How much the store holds right now, in bytes. */
  async size(): Promise<number> {
    return (await this.sessionsBySize()).reduce((sum, entry) => sum + entry.bytes, 0);
  }

  /** Every session in the store, oldest first — which is the order a purge walks. */
  private async sessionsBySize(): Promise<{ id: string; bytes: number; at: number }[]> {
    let entries: string[];

    try {
      entries = await readdir(this.root);
    } catch {
      return [];
    }

    const sessions = await Promise.all(
      entries.map(async (id) => ({
        id,
        bytes: await bytesUnder(path.join(this.root, id)),
        at: (await stat(path.join(this.root, id))).mtimeMs,
      })),
    );

    return sessions.sort((left, right) => left.at - right.at);
  }

  /**
   * Where one snapshot lives.
   *
   * The file name is a hash of the path plus the hash of the contents, never the path itself: a
   * path can be any length and contain any byte a filesystem allows, and building a name out of
   * it is how a store ends up with a traversal in it.
   */
  private blobPathFor(sessionId: string, promptId: string, filePath: string, hash: string): string {
    const name = `${digestOf(Buffer.from(filePath, 'utf8')).slice(0, 16)}-${hash.slice(0, 16)}`;

    return path.join(this.root, sessionId, promptId, name);
  }
}

function digestOf(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Bytes under a directory, following nothing and counting regular files only. */
async function bytesUnder(directory: string): Promise<number> {
  let total = 0;

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    total += entry.isDirectory() ? await bytesUnder(full) : (await stat(full)).size;
  }

  return total;
}

/** Whether the failure means there is nothing there, rather than that we could not look. */
function isAbsent(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;

  return code === 'ENOENT' || code === 'ENOTDIR';
}
