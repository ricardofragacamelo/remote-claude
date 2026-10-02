import { posix } from 'node:path';

import {
  FilePath,
  FileNotFoundError,
  FileTooLargeError,
  InvalidFilePathError,
} from '@domain/files';
import type { FilePathViolation } from '@domain/files';
import { WorkspaceNotADirectoryError } from '@domain/workspace';
import type { WorkspacePath } from '@domain/workspace';
import type { TransferLimits } from './file-limits';
import type { FolderDisk } from './ports/folder-disk.port';

/** One file an upload declares: where it goes, relative to the folder it is sent into, and its size. */
export interface DeclaredFile {
  readonly path: string;
  readonly size: number;
}

/** Where an upload's files go, item by item, in the order they were declared. */
export interface UploadPlan {
  /** The folder they are sent into. */
  readonly directory: FilePath;
  /** One per item, relative to the open folder. */
  readonly targets: readonly FilePath[];
}

/**
 * Everything an upload is checked for **before the first byte is written** — plan 07, B-49. The
 * preflight asks the same, so the conflict screen and the upload never disagree about a name.
 *
 * 1. every segment of every path by the rule of the name, Windows' reserved names included, and no
 *    two items onto one name — `400` with **every** reason of **every** item (S-306, S-357);
 * 2. the ceilings ([07 · D-16](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos)):
 *    the items, each file, and the sum — `413` with what was measured (S-304, S-358).
 *
 * @param field what the items were sent as — `manifest` or `items` — for `details[]`
 * @throws {InvalidFilePathError} a path, or two, that cannot be written
 * @throws {import('@domain/workspace').WorkspaceNotAllowedError} `directory` climbs out of the folder
 * @throws {FileTooLargeError} past a ceiling
 */
export function planUpload(
  folder: WorkspacePath,
  directory: string,
  items: readonly DeclaredFile[],
  limits: Pick<TransferLimits, 'uploadMaxBytes' | 'uploadMaxEntries' | 'uploadMaxTotalBytes'>,
  field: string,
): UploadPlan {
  const into = FilePath.create(folder, directory, 'directory');
  const violations = items.flatMap((item, index) =>
    FilePath.uploadViolations(item.path, `${field}.${String(index)}.path`),
  );

  if (violations.length > 0) {
    throw new InvalidFilePathError(violations);
  }

  const planned = items.map((item) => ({
    target: FilePath.naming(folder, posix.join(into.relative, item.path)),
    size: item.size,
  }));
  const targets = planned.map((item) => item.target);
  const repeated = repeatsOf(targets, field);

  if (repeated.length > 0) {
    throw new InvalidFilePathError(repeated);
  }

  within(into, planned, limits);

  return { directory: into, targets };
}

/**
 * The folder an upload goes into has to be there, and be a folder — what the items' subfolders are
 * created under. A link to a folder inside is followed by the fence when the files are written.
 *
 * @throws {FileNotFoundError} nothing is there
 * @throws {WorkspaceNotADirectoryError} a file, or something that is neither
 */
export async function ensureDirectory(disk: FolderDisk, directory: FilePath): Promise<void> {
  const found = await disk.inspect(directory);

  if (found === null) {
    throw new FileNotFoundError(directory.relative);
  }

  if (found.kind === 'file' || found.kind === 'other') {
    throw new WorkspaceNotADirectoryError(directory.absolute);
  }
}

/** The items that land where an earlier one already does. */
function repeatsOf(targets: readonly FilePath[], field: string): FilePathViolation[] {
  return targets.flatMap((target, index) =>
    targets.findIndex((other) => other.equals(target)) < index
      ? [{ field: `${field}.${String(index)}.path`, rule: 'mustBeUnique' as const }]
      : [],
  );
}

/** @throws {FileTooLargeError} past the items, one file, or the sum — measured in that order */
function within(
  directory: FilePath,
  planned: readonly { readonly target: FilePath; readonly size: number }[],
  limits: Pick<TransferLimits, 'uploadMaxBytes' | 'uploadMaxEntries' | 'uploadMaxTotalBytes'>,
): void {
  if (planned.length > limits.uploadMaxEntries) {
    throw new FileTooLargeError(
      directory.relative,
      planned.length,
      limits.uploadMaxEntries,
      'entries',
    );
  }

  const largest = planned.find((item) => item.size > limits.uploadMaxBytes);

  if (largest !== undefined) {
    throw new FileTooLargeError(
      largest.target.relative,
      largest.size,
      limits.uploadMaxBytes,
      'bytes',
    );
  }

  const total = planned.reduce((sum, item) => sum + item.size, 0);

  if (total > limits.uploadMaxTotalBytes) {
    throw new FileTooLargeError(directory.relative, total, limits.uploadMaxTotalBytes, 'bytes');
  }
}
