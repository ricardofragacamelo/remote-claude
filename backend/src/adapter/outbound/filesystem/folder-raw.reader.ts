import { constants } from 'node:fs';
import type { BigIntStats, ReadStream } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { Readable } from 'node:stream';

import type { OutgoingBytes, RawFile } from '@application/files';
import { BINARY_PROBE_BYTES, FileNotAFileError } from '@domain/files';
import type { Etag, FilePath } from '@domain/files';
import { digestOf } from './atomic-file.writer';
import type { FolderFence } from './folder-fence';

/**
 * Opens a file for its raw bytes — the previews, the hexadecimal view, the paginated read and the
 * download (plan 07, B-48).
 *
 * The same containment as the editor's read: the `realpath` inside the open folder, `O_NOFOLLOW`,
 * the descriptor checked, and `O_NONBLOCK`, so a FIFO is refused rather than waited on. Everything
 * after is read from that descriptor — the identity by `fstat`, the probe and the hash by `pread`
 * from the start, the part asked for by a stream with its own positions — so the version said and
 * the bytes sent are of one file, whatever renames the folder sees meanwhile.
 */
export class FolderRawReader {
  constructor(private readonly fence: FolderFence) {}

  /** @throws {FileNotAFileError} a folder, a FIFO, a socket, a device */
  async open(file: FilePath): Promise<RawFile> {
    const real = await this.fence.realInside(file);
    const handle = await this.fence.open(file, real, constants.O_RDONLY | constants.O_NONBLOCK);

    try {
      const stats = await handle.stat({ bigint: true });

      if (!stats.isFile()) {
        throw new FileNotAFileError(file.relative);
      }

      return new OpenRawFile(handle, real, stats, await headOf(handle, Number(stats.size)));
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
}

/** A file held open by its descriptor until {@link close} — by whoever sent its bytes, or refused. */
class OpenRawFile implements RawFile {
  readonly size: number;
  readonly identity: string;
  readonly changedAt: Date;

  private stream: ReadStream | null = null;
  private closed = false;

  constructor(
    private readonly handle: FileHandle,
    readonly realPath: string,
    stats: BigIntStats,
    readonly head: Uint8Array,
  ) {
    this.size = Number(stats.size);
    this.identity = [stats.dev, stats.ino, stats.size, stats.mtimeNs, stats.ctimeNs].join(':');
    this.changedAt = new Date(Number(stats.ctimeNs / 1_000_000n));
  }

  digest(): Promise<Etag> {
    return digestOf(this.handle);
  }

  bytes(start: number, end: number): OutgoingBytes {
    // A stream of its own positions, never the descriptor's: the hash read from the start already.
    // `autoClose: false` — the descriptor is closed once, by `close`, however the stream ends.
    this.stream =
      end < start ? null : this.handle.createReadStream({ start, end, autoClose: false });

    // An empty file has no part to stream: a body of no chunks.
    return { chunks: this.stream ?? Readable.from([]), close: () => this.close() };
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.stream?.destroy();
    await this.handle.close();
  }
}

/** The first bytes of an open file, read at position 0 — what its type is told from. */
async function headOf(handle: FileHandle, size: number): Promise<Uint8Array> {
  const head = Buffer.alloc(Math.min(BINARY_PROBE_BYTES, size));
  const { bytesRead } = await handle.read(head, 0, head.length, 0);

  return head.subarray(0, bytesRead);
}
