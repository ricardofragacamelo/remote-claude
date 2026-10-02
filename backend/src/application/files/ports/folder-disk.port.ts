import type { EntryKind, Etag, FilePath, TreeChild } from '@domain/files';

/** One level of a directory, as read. */
export interface TreeRead {
  readonly children: readonly TreeChild[];
  /** Read to the end, rather than stopped at the ceiling. */
  readonly exhausted: boolean;
}

/** The bytes of a file, from one descriptor, and what that descriptor said about it. */
export interface FileBytes {
  readonly bytes: Uint8Array;
  readonly mtime: Date;
}

/** What an entry is right now, without following it if it is a link. */
export interface EntryInspection {
  readonly kind: EntryKind;
  /** In bytes; for a link, the link's own. */
  readonly size: number;
  /**
   * `<device>:<inode>` — what tells two names of one entry apart from two entries: renaming
   * `a.ts` to `A.ts` on a filesystem that ignores case finds "something" at the destination, and it
   * is the source itself (S-99).
   */
  readonly identity: string;
}

/** A file as a write left it. */
export interface WrittenFile {
  readonly size: number;
  readonly mtime: Date;
}

/** How much a copy may carry, counted before the first byte is copied (S-104). */
export interface CopyCeiling {
  readonly entries: number;
  readonly bytes: number;
}

/** How many entries a folder holds, all the way down, counted up to a cap (S-111). */
export interface EntryCount {
  readonly count: number;
  readonly capped: boolean;
}

/**
 * What arrives from the outside a chunk at a time — the part of an upload — read once, in order.
 * `null` at its end. A part cut short (the connection dropped, the body ended early) simply ends
 * early: the reader counts what arrived and refuses what does not add up.
 */
export interface ChunkSource {
  next(): Promise<Uint8Array | null>;
}

/**
 * Bytes going out a chunk at a time — a file's, a zip's — and the one way to stop them. A client
 * that goes away is a `close()`: what is open is closed, and nothing more is opened (S-299).
 */
export interface OutgoingBytes {
  readonly chunks: AsyncIterable<Uint8Array>;
  /** Idempotent, and safe whether the chunks were read to the end, halfway, or not at all. */
  close(): Promise<void>;
}

/**
 * A regular file open for its raw bytes: one descriptor, from which the version, the first bytes
 * and the bytes asked for are all read — so they are of one file, whatever renames happen meanwhile.
 */
export interface RawFile {
  /** Where it really is — a link inside the open folder followed. The subject of a download. */
  readonly realPath: string;
  readonly size: number;
  /**
   * `<dev>:<ino>:<size>:<mtimeNs>:<ctimeNs>` — what changes whenever the bytes may have: the key
   * the version is remembered by, so paging through a large file does not hash it at every page.
   */
  readonly identity: string;
  /** When its status last changed: a change too recent to trust the identity with (racy). */
  readonly changedAt: Date;
  /** The first bytes, up to the probe — what the content type is read from. */
  readonly head: Uint8Array;
  /** The SHA-256 of everything it holds, read from the descriptor. */
  digest(): Promise<Etag>;
  /** From `start` to `end`, both inclusive — closing them closes the file. Called once. */
  bytes(start: number, end: number): OutgoingBytes;
  close(): Promise<void>;
}

/** One entry a zip will carry, as the walk of a selection found it. */
export interface ArchiveSource {
  /** Which item of the selection it is, or is under. */
  readonly selection: number;
  readonly path: FilePath;
  readonly kind: 'file' | 'directory';
  /** The bytes of a file — of its target, for a link inside the open folder; 0 for a folder. */
  readonly size: number;
  readonly mtime: Date;
  readonly mode: number;
}

/** An entry of a zip, and its name in it. */
export interface ArchiveEntry extends ArchiveSource {
  readonly name: string;
}

/**
 * A file whose bytes arrived and are in a temporary of ours — beside where it goes, or in the
 * nearest folder above that exists yet — hashed and counted, and not at its name: the trail is told
 * what it is first, and only then is it put there (07 · D-02). Every path out ends in
 * {@link discard}, so a temporary never outlives the request.
 */
export interface StagedFile {
  readonly etag: Etag;
  readonly size: number;

  /**
   * Puts it at `entry` by a `link`, which fails if anything is there — atomic, never over anything
   * — creating the folders above that are missing, one at a time, through the fence.
   *
   * @throws {import('@domain/files').FileExistsError} the name is taken
   */
  create(entry: FilePath): Promise<WrittenFile>;

  /** Replaces a file with it, as {@link FolderDisk.write} does: atomic, `guard` asked before. */
  replace(file: FilePath, guard: WriteGuard): Promise<WrittenFile>;

  /** Removes the temporary, if it is still there. Idempotent. */
  discard(): Promise<void>;
}

/**
 * Called by {@link FolderDisk.write} right before the rename, with the version on disk at that
 * instant — `null` when nothing is there. It throws to stop the write.
 */
export type WriteGuard = (current: Etag | null) => void;

/**
 * The disk, as the `files` module touches it — the one place it does.
 *
 * Every method takes {@link FilePath}s, whose string half of the fence has already run, and runs the
 * other half at **every** call: the `realpath` of what it touches (or of the nearest folder that
 * exists, for what is about to) must stay inside the open folder, and what it opens is checked
 * again **on the descriptor**, so a folder swapped for a link between the check and the open is
 * caught there and nothing is read or written ([07 · B-07](../../../../../docs/plans/07-explorer-and-editor/F1-file-read.md#b-07--filepath-o-caminho-dentro-da-pasta-aberta-)).
 *
 * The refusals are the domain's errors, thrown here, so every use case answers the same disk
 * failure with the same code: `WORKSPACE_NOT_ALLOWED` (escaped), `FILE_NOT_FOUND`,
 * `FILE_ACCESS_DENIED`, `FILE_OPERATION_INVALID` (`symlinkLoop`, `crossDevice`) and `STORAGE_FULL`
 * may come from any of them; each method lists what is particular to it.
 *
 * No method logs contents — only paths, sizes, counts and durations
 * (docs/architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log).
 */
export interface FolderDisk {
  /**
   * One level, never more than `limit` children: the read **stops** there.
   *
   * @throws {import('@domain/workspace').WorkspaceNotADirectoryError} it is a file
   * @throws {import('@domain/workspace').WorkspaceDirectoryUnreadableError} not ours to read
   */
  list(directory: FilePath, limit: number): Promise<TreeRead>;

  /**
   * At most `limit` bytes, read from **one** descriptor — never a `stat` and then a read, which lets
   * the file grow in between (S-55). Links inside the open folder are followed (S-21).
   *
   * @throws {import('@domain/files').FileNotAFileError} a folder, a FIFO, a socket, a device
   * @throws {import('@domain/files').FileTooLargeError} past `limit`
   */
  read(file: FilePath, limit: number): Promise<FileBytes>;

  /** The version of a regular file, hashed whatever its size; `null` for anything else or nothing. */
  version(file: FilePath): Promise<Etag | null>;

  /** What is at the path now, without following a link there; `null` when nothing is. */
  inspect(entry: FilePath): Promise<EntryInspection | null>;

  /**
   * The real path of an entry — following a link inside the open folder — or, when it does not
   * exist yet, of where it would be. What the {@link import('@application/shared').PathLock} is
   * taken on, so a link and its target are one file.
   */
  locate(entry: FilePath): Promise<string>;

  /**
   * Replaces a file's contents **atomically**: a temporary beside it, `fsync`, the mode kept, the
   * `guard` asked right before the `rename`. A failure leaves the original exactly as it was and no
   * temporary behind (S-69). A file with other hard links is written in place instead, so the
   * links are not broken in silence ([07 · D-05](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-05--symlinks-e-hard-links)).
   */
  write(file: FilePath, bytes: Uint8Array, guard: WriteGuard): Promise<WrittenFile>;

  /**
   * Creates a file with `content`, or a folder when `content` is `null`, with the folders above it
   * that are missing — and never over anything (`O_EXCL`, S-85).
   *
   * @throws {import('@domain/files').FileExistsError} something is already there
   */
  create(entry: FilePath, content: Uint8Array | null): Promise<void>;

  /**
   * Moves without replacing the destination — the `rename` of Linux would
   * ([07 · D-12](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-12--mover-sem-sobrescrever)).
   *
   * @throws {import('@domain/files').FileExistsError} the destination is taken
   */
  move(from: FilePath, to: FilePath): Promise<void>;

  /**
   * Copies a file or a folder; a link is copied as a link, never followed (S-101). The ceiling is
   * measured first, and a copy that fails halfway removes what it had made (S-105).
   *
   * @throws {import('@domain/files').FileExistsError} the destination is taken
   * @throws {import('@domain/files').FileTooLargeError} past the ceiling, before anything is copied
   */
  copy(from: FilePath, to: FilePath, ceiling: CopyCeiling): Promise<void>;

  /** The entries inside a folder, all the way down, never through a link, up to `cap`. */
  count(directory: FilePath, cap: number): Promise<EntryCount>;

  /**
   * Removes an entry. A link is removed and its target left alone, wherever it is (S-113); a
   * recursive removal never goes through a link either (S-114).
   */
  remove(entry: FilePath, recursive: boolean): Promise<void>;

  /**
   * Opens a regular file for its raw bytes, through the fence — a link inside followed, one outside
   * refused, the descriptor checked (07 · B-48). The caller closes it.
   *
   * @throws {import('@domain/files').FileNotAFileError} a folder, a FIFO, a socket, a device
   */
  openRaw(file: FilePath): Promise<RawFile>;

  /**
   * Walks a selection for a zip and measures it, **before** anything is read: never through a link
   * to a folder; leaving out a link that leads outside or nowhere, a FIFO, a socket, a device, a
   * name that is not UTF-8 and, below what was selected, what D-10 hides. A link to a file inside
   * is the file it leads to. The walk stops as soon as either ceiling is passed.
   *
   * @throws {import('@domain/files').FileTooLargeError} past the ceiling — `measure` says which
   * @throws {import('@domain/files').FileNotAFileError} a selected item is neither file nor folder
   */
  survey(selection: readonly FilePath[], ceiling: CopyCeiling): Promise<readonly ArchiveSource[]>;

  /**
   * A zip of `entries`, streamed: each file is opened through the fence only when its turn comes,
   * and closed when it is done or when the zip is closed. A failure halfway destroys the stream —
   * the zip is cut, never a valid one with something missing.
   */
  archive(entries: readonly ArchiveEntry[]): Promise<OutgoingBytes>;

  /**
   * Receives exactly `size` bytes from `source` into a temporary for `entry`, hashing them as they
   * come — never holding them whole. A source that carries more is cut one byte past `size`; one
   * that carries fewer is refused; either way the temporary is removed.
   *
   * @throws {import('@domain/files').UploadSizeMismatchError} the source did not carry `size` bytes
   */
  stage(entry: FilePath, source: ChunkSource, size: number): Promise<StagedFile>;
}

export const FOLDER_DISK = Symbol('FolderDisk');
