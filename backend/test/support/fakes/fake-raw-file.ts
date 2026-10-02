import type { OutgoingBytes, RawFile } from '@application/files';
import { Etag } from '@domain/files';

/** A raw file of a unit spec, and what was done to it. */
export interface FakeRawFile extends RawFile {
  /** How many times it was hashed. */
  digests: number;
  /** The parts asked for, `[start, end]`. */
  readonly asked: (readonly [number, number])[];
  closed: boolean;
}

/**
 * An open file held in memory: its bytes are `content`, its version their hash, and its identity
 * whatever the spec says — the descriptor of `FolderRawReader`, without a disk.
 */
export function fakeRawFile(
  content: Uint8Array,
  options: { readonly identity?: string; readonly changedAt?: Date } = {},
): FakeRawFile {
  const file: FakeRawFile = {
    realPath: '/srv/app/file',
    size: content.length,
    identity: options.identity ?? `1:2:${String(content.length)}:3:4`,
    changedAt: options.changedAt ?? new Date(0),
    head: content.subarray(0, 8192),
    digests: 0,
    asked: [],
    closed: false,
    digest: () => {
      file.digests += 1;
      return Promise.resolve(Etag.of(content));
    },
    bytes: (start, end): OutgoingBytes => {
      file.asked.push([start, end]);
      return { chunks: chunksOf(content.subarray(start, end + 1)), close: () => file.close() };
    },
    close: () => {
      file.closed = true;
      return Promise.resolve();
    },
  };

  return file;
}

async function* chunksOf(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield await Promise.resolve(bytes);
}
