import { posix } from 'node:path';

import type { FolderDisk } from '@application/files';
import type { InspectedReference, ReferenceInspector } from '@application/session';
import {
  FileNotAFileError,
  FileNotTextError,
  FilePath,
  OCTET_STREAM,
  contentTypeOf,
} from '@domain/files';
import { ReferenceKindMismatchError } from '@domain/session';
import { WorkspaceNotADirectoryError, WorkspaceNotAllowedError } from '@domain/workspace';
import type { WorkspacePath } from '@domain/workspace';

/** What the `Read` of Claude does not read as text or as an image: refused before it is named. */
const NOT_READ: readonly string[] = [OCTET_STREAM, 'application/pdf'];

/**
 * The references of a prompt, checked by the fence of the `files` module — plan 08, B-44.
 *
 * `FilePath` is the string half: no NUL, no backslash, nothing that climbs out of the folder. The
 * disk is the other half, at the `realpath` and on the descriptor: a link inside the folder that
 * leads out is `WORKSPACE_NOT_ALLOWED` (S-200), exactly as when the editor opens it. A file is
 * opened only to read its first bytes — what tells text and an image from a binary — and closed;
 * nothing of it is kept, and nothing of it is logged but its size.
 */
export class FilesModuleReferenceInspector implements ReferenceInspector {
  constructor(private readonly disk: FolderDisk) {}

  async inspect(
    workspace: WorkspacePath,
    raw: string,
    kind: 'file' | 'folder',
  ): Promise<InspectedReference> {
    const entry = FilePath.create(workspace, relativeIn(workspace, raw));

    return kind === 'folder' ? this.folder(entry) : this.file(entry);
  }

  private async folder(entry: FilePath): Promise<InspectedReference> {
    try {
      await this.disk.list(entry, 1);
    } catch (error) {
      throw error instanceof WorkspaceNotADirectoryError
        ? new ReferenceKindMismatchError(nameOf(entry), 'folder')
        : error;
    }

    return { relative: entry.relative, size: 0 };
  }

  private async file(entry: FilePath): Promise<InspectedReference> {
    const opened = await this.disk.openRaw(entry).catch((error: unknown) => {
      throw error instanceof FileNotAFileError
        ? new ReferenceKindMismatchError(nameOf(entry), 'file')
        : error;
    });

    try {
      if (NOT_READ.includes(contentTypeOf(opened.head, opened.size <= opened.head.length))) {
        throw new FileNotTextError(nameOf(entry), 'binary');
      }

      return { relative: entry.relative, size: opened.size };
    } finally {
      await opened.close();
    }
  }
}

/**
 * A path of the client, relative to the session's folder: as it came when relative — `FilePath`
 * judges it —, and cut from the folder when absolute. An absolute path anywhere else is outside.
 */
function relativeIn(workspace: WorkspacePath, raw: string): string {
  if (!posix.isAbsolute(raw)) {
    return raw;
  }

  const absolute = posix.normalize(raw).replace(/\/+$/, '');
  const prefix = workspace.value === '/' ? '/' : `${workspace.value}/`;

  if (absolute === workspace.value) {
    return '';
  }

  if (!absolute.startsWith(prefix)) {
    throw new WorkspaceNotAllowedError(raw);
  }

  return absolute.slice(prefix.length);
}

function nameOf(entry: FilePath): string {
  return entry.relative === '' ? '.' : entry.relative;
}
