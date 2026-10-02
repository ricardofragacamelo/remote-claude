import type { WorkspacePath } from '@domain/workspace';

/** A reference of a prompt, checked on disk. */
export interface InspectedReference {
  /** Relative to the session's folder, POSIX; `''` is the folder itself. */
  readonly relative: string;

  /** In bytes, for a file; `0` for a folder, whose size is not added up (D-23). */
  readonly size: number;
}

/**
 * How `session` asks `files` whether a path a prompt names may be read by Claude — plan 08, B-44.
 *
 * The check is the fence of the `files` module of plan 07 — the string half of `FilePath` and the
 * `realpath` half of the disk — against the **session's** folder, through a port, so `session`
 * depends on the question and never on who answers it
 * ([fronteiras](../../../../../docs/architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem)).
 */
export interface ReferenceInspector {
  /**
   * @param workspace the folder the session runs in — its `cwd`
   * @param raw the path as the client sent it: relative to the folder, or absolute inside it
   * @throws {import('@domain/workspace').WorkspaceNotAllowedError} out of the folder: `..`, an
   *   absolute path elsewhere, a link that leads out
   * @throws {import('@domain/files').InvalidFilePathError} a NUL or a backslash
   * @throws {import('@domain/files').FileNotFoundError} nothing there
   * @throws {import('@domain/session').ReferenceKindMismatchError} a folder named as a file, or the
   *   other way round
   * @throws {import('@domain/files').FileNotTextError} a binary that is not an image
   */
  inspect(
    workspace: WorkspacePath,
    raw: string,
    kind: 'file' | 'folder',
  ): Promise<InspectedReference>;
}

export const REFERENCE_INSPECTOR = Symbol('ReferenceInspector');
