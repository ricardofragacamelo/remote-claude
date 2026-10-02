import type { PathLock } from '@application/shared';
import { FileChangedError, FileTooLargeError } from '@domain/files';
import type { Etag, FilePath, WriteOutcome } from '@domain/files';
import type { UserWrites } from './claude-writes';
import type { FileLimits } from './file-limits';
import type { FileTrail } from './file-trail';
import type { FolderDisk, WrittenFile } from './ports/folder-disk.port';
import type { FolderResolver } from './ports/folder-resolver.port';
import type { TextCodec } from './ports/text-codec.port';
import { encodeText } from './text-content';

/**
 * What every write of a person's text needs: the folder, the disk, the codec, the lock the undo
 * shares, the trail and the editing ceiling — one object, so saving and creating are given the
 * same things and can never be wired with different ones.
 */
export interface FileWriting {
  readonly folders: FolderResolver;
  readonly disk: FolderDisk;
  readonly codec: TextCodec;
  readonly lock: PathLock;
  readonly trail: FileTrail;
  readonly limits: Pick<FileLimits, 'maxEditBytes'>;
  /** The person's writes the disk took, for the watcher to label the changes they cause `user`. */
  readonly writes: UserWrites;
}

/** What a write left at a path: the bytes of a file when they are known, anything otherwise. */
export function outcomeOf(version: Etag | null): WriteOutcome {
  return version === null ? { kind: 'anything' } : { kind: 'content', hash: version.digest };
}

/** Text as it is written: its contents, the encoding and whether it carries a byte-order mark. */
export interface TextToWrite {
  readonly content: string;
  readonly encoding: string;
  readonly bom: boolean;
}

/**
 * The bytes a write puts on disk — refused, before the disk is touched, when they do not fit the
 * encoding or pass the editing ceiling (S-73, S-76).
 *
 * @throws {import('@domain/files').UnknownEncodingError} an encoding this server does not know
 * @throws {import('@domain/files').FileNotEncodableError} a character the encoding cannot hold
 * @throws {FileTooLargeError} past the ceiling
 */
export function encodedWithin(writing: FileWriting, path: string, text: TextToWrite): Uint8Array {
  const bytes = encodeText(path, text.content, text.encoding, text.bom, writing.codec);
  const limit = writing.limits.maxEditBytes;

  if (bytes.length > limit) {
    throw new FileTooLargeError(path, bytes.length, limit, 'bytes');
  }

  return bytes;
}

/**
 * Writes over `current`, and only over it: the atomic write asks again right before its rename,
 * and a version that changed in between — Claude wrote, or removed the file — stops it with `412`
 * and the version found. What a save and a restore of the history share.
 */
export function writeOver(
  disk: FolderDisk,
  file: FilePath,
  bytes: Uint8Array,
  current: Etag,
): Promise<WrittenFile> {
  return disk.write(file, bytes, (onDisk) => {
    if (onDisk === null || !onDisk.equals(current)) {
      throw new FileChangedError(file.relative, onDisk?.value ?? null);
    }
  });
}
