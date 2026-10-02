import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { Etag } from '@domain/files';
import type { Logger } from '@shared/logging/logger';
import { codeOf, isAbsent } from './folder-file-system';

/** A SHA-256 in hex — the only name a blob may have, so a name can never be read as a path. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** What a blob's shard folder is called: the first two hex digits of its hash. */
const SHARD = /^[0-9a-f]{2}$/;

/**
 * The blobs of the local history, on the backend's disk — plan 07, B-56.
 *
 * **Addressed by content**: a blob is named by the SHA-256 of its bytes, under a folder of its first
 * two hex digits (`<2 hex>/<sha256>`), so the same contents kept ten times are one blob (S-330), and
 * a thousand blobs never crowd one folder. A blob is written once, by a temporary beside it, `fsync`
 * and a `rename` — a reader never sees half of one — and never rewritten: one already there holds
 * the same bytes by construction.
 *
 * It never decides what to delete: the sweep removes what the store's rows no longer name, under
 * the lock that keeps every keeping out (`DrizzleFileHistoryStore`). Every call logs both ends at
 * `debug` with the hash and the bytes — never the contents.
 */
export class HistoryBlobDirectory {
  constructor(
    private readonly root: string,
    private readonly logger: Logger,
  ) {}

  /** Writes a blob unless it is there already. */
  put(hash: string, bytes: Uint8Array): Promise<void> {
    return this.edge('files.history.blob.put', { hash, bytes: bytes.length }, async () => {
      const target = this.pathOf(hash);

      if (await exists(target)) {
        return { reused: true };
      }

      await mkdir(path.dirname(target), { recursive: true });
      await writeThenRename(target, bytes);
      return { reused: false };
    }).then(() => undefined);
  }

  /**
   * A blob's bytes, `null` when it is not there — or when they are not the bytes it is named by: a
   * blob damaged on disk is reported, never handed out as a version.
   */
  async read(hash: string): Promise<Uint8Array | null> {
    const read = await this.edge('files.history.blob.read', { hash }, async () => {
      const bytes = await unlessAbsent(readFile(this.pathOf(hash)), null);

      return { bytes, damaged: bytes !== null && Etag.of(bytes).digest !== hash };
    });

    if (read.damaged) {
      this.logger.warn(
        { op: 'files.history.blob.read', layer: 'adapter', hash },
        'a blob of the local history does not hold the contents it is named by',
      );
      return null;
    }

    return read.bytes;
  }

  /**
   * Removes every blob no row names, and every temporary a write left behind. Only under the
   * purge's exclusive lock: there, no keeping is halfway, so a temporary is a leftover and a blob
   * nobody names stays that way.
   *
   * @returns how many files it removed
   */
  async sweep(named: ReadonlySet<string>): Promise<number> {
    const swept = await this.edge('files.history.blob.sweep', {}, async () => {
      let removed = 0;

      for (const shard of (await namesIn(this.root)).filter((name) => SHARD.test(name))) {
        for (const name of await namesIn(path.join(this.root, shard))) {
          if (!named.has(name)) {
            await rm(path.join(this.root, shard, name), { force: true, recursive: true });
            removed += 1;
          }
        }
      }

      return { removed };
    });

    return swept.removed;
  }

  private pathOf(hash: string): string {
    if (!SHA256_HEX.test(hash)) {
      throw new Error('a blob of the local history is named by a SHA-256 in hex, and nothing else');
    }

    return path.join(this.root, hash.slice(0, 2), hash);
  }

  /**
   * One call at the edge, logged on the way in and on the way out — with what it did, or the code
   * it failed with. The result's fields are the summary, so a field that would carry contents is
   * one this class never returns from here: `bytes` is a `Buffer` and logged by its length.
   */
  private async edge<T extends Readonly<Record<string, unknown>>>(
    op: string,
    fields: Readonly<Record<string, unknown>>,
    work: () => Promise<T>,
  ): Promise<T> {
    const context = { op, layer: 'adapter', ...fields };
    const startedAt = Date.now();

    this.logger.debug(context, `${op} started`);
    let outcome: Readonly<Record<string, unknown>> = { outcome: 'failed' };

    try {
      const result = await work();
      outcome = { outcome: 'done', ...summaryOf(result) };
      return result;
    } catch (error) {
      outcome = { ...outcome, errorCode: codeOf(error) };
      throw error;
    } finally {
      this.logger.debug(
        { ...context, ...outcome, durationMs: Date.now() - startedAt },
        `${op} ended`,
      );
    }
  }
}

/** A result as the log carries it: bytes by their length, never the bytes. */
function summaryOf(result: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [
      key,
      value instanceof Uint8Array ? value.length : value,
    ]),
  );
}

/** A blob, by a temporary beside it: written, flushed, then renamed into its name. */
async function writeThenRename(target: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`;

  try {
    const handle = await open(temporary, 'wx');

    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function exists(target: string): Promise<boolean> {
  return (await unlessAbsent(stat(target), null)) !== null;
}

/** The names in a folder; none when it does not exist yet — a store nothing was kept in. */
function namesIn(folder: string): Promise<string[]> {
  return unlessAbsent(readdir(folder), []);
}

/** What `work` answers, or `absent` when there was nothing at the path; any other failure goes on. */
function unlessAbsent<T, F>(work: Promise<T>, absent: F): Promise<T | F> {
  return work.catch((error: unknown) => {
    if (isAbsent(error)) {
      return absent;
    }

    throw error;
  });
}
