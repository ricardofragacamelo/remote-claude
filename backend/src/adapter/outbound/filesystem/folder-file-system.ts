import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  opendir,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
  unlink,
} from 'node:fs/promises';
import type { Dir, Stats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';

import {
  FileAccessDeniedError,
  FileExistsError,
  FileNotFoundError,
  FileOperationInvalidError,
  StorageFullError,
} from '@domain/files';
import type { EntryKind, FilePath } from '@domain/files';

/**
 * The calls the `files` adapter makes, so a test can stand in for a moment it cannot build — a
 * folder swapped for a link between a check and an open, a disk that fills up halfway, another
 * filesystem under the destination.
 */
export interface FolderFileSystem {
  realpath(path: string | Buffer): Promise<string>;
  lstat(path: string | Buffer): Promise<Stats>;
  stat(path: string | Buffer): Promise<Stats>;
  open(path: string, flags: number, mode?: number): Promise<FileHandle>;
  opendir(path: string, options: { readonly encoding: 'buffer' }): Promise<Dir>;
  readlink(path: string): Promise<string>;
  mkdir(path: string): Promise<void>;
  link(existing: string, created: string): Promise<void>;
  symlink(target: string, path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copyFile(from: string, to: string, mode: number): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  rm(
    path: string,
    options: { readonly recursive: boolean; readonly force: boolean },
  ): Promise<void>;
}

export const nodeFolderFileSystem: FolderFileSystem = {
  realpath: (path) => realpath(path),
  lstat: (path) => lstat(path),
  stat: (path) => stat(path),
  open: (path, flags, mode) => open(path, flags, mode),
  // `opendir` types its `Dir` by the string encoding; the buffer one is the same object, and its
  // entries carry their names as bytes, which is the point of asking for it.
  opendir: (path, options) => opendir(path, options as unknown as { encoding: 'utf8' }),
  readlink: (path) => readlink(path),
  mkdir: async (path) => {
    await mkdir(path);
  },
  link: (existing, created) => link(existing, created),
  symlink: (target, path) => symlink(target, path),
  rename: (from, to) => rename(from, to),
  copyFile: (from, to, mode) => copyFile(from, to, mode),
  unlink: (path) => unlink(path),
  rmdir: (path) => rmdir(path),
  rm: (path, options) => rm(path, options),
};

/** What an entry is, as `lstat` (or an `fstat`) says — never following it. */
export function kindOf(stats: Stats): EntryKind {
  if (stats.isSymbolicLink()) {
    return 'symlink';
  }

  if (stats.isDirectory()) {
    return 'directory';
  }

  return stats.isFile() ? 'file' : 'other';
}

/** The `code` of a failure of `node:fs`, or `''`. */
export function codeOf(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

  return typeof code === 'string' ? code : '';
}

/** Failures that mean "there is nothing at that path". `ENOTDIR`: under something that is no folder. */
export function isAbsent(error: unknown): boolean {
  return ['ENOENT', 'ENOTDIR'].includes(codeOf(error));
}

/**
 * What a failure of the disk means to the person who asked, as the domain says it.
 *
 * One table for every operation of the module, so the same refusal of the operating system is the
 * same answer whichever route met it. Anything not in it is ours to explain and goes on as it is —
 * a `500`, logged by the filter.
 */
const DOMAIN_FAILURES: Readonly<Record<string, (entry: FilePath) => Error>> = {
  ENOENT: (entry) => new FileNotFoundError(entry.relative),
  ENOTDIR: (entry) => new FileNotFoundError(entry.relative),
  EEXIST: (entry) => new FileExistsError(entry.relative),
  ELOOP: (entry) => new FileOperationInvalidError(entry.relative, 'symlinkLoop'),
  EXDEV: (entry) => new FileOperationInvalidError(entry.relative, 'crossDevice'),
  EACCES: (entry) => new FileAccessDeniedError(entry.relative, 'permission'),
  EPERM: (entry) => new FileAccessDeniedError(entry.relative, 'permission'),
  EROFS: (entry) => new FileAccessDeniedError(entry.relative, 'readOnlyFileSystem'),
  ENOSPC: (entry) => new StorageFullError(entry.relative),
  EDQUOT: (entry) => new StorageFullError(entry.relative),
};

/** A failure of the disk about `entry`, as the error the request answers with. */
export function failureOf(entry: FilePath, error: unknown): unknown {
  return DOMAIN_FAILURES[codeOf(error)]?.(entry) ?? error;
}
