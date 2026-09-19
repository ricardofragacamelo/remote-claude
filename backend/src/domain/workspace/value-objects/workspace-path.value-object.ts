import { isAbsolute, resolve, sep } from 'node:path';

import { InvalidWorkspacePathError } from '../errors/invalid-workspace-path.error';

/**
 * An absolute, normalised path on the machine that runs Claude.
 *
 * It is the first line of defence of the whole product: `cwd` of the Agent SDK's `query()` **is**
 * this value, so a path that gets past here is a directory Claude may run in. The rule is pure —
 * string in, string out, no `stat`, no symlink resolution — which is what makes every refusal
 * cheap to test and impossible to race.
 *
 * `node:path` is used and is not I/O: it manipulates strings and never touches the filesystem.
 * Whether the path *exists* and whether it is a *directory* are different questions, asked one
 * layer out, because they are I/O and can change between the asking and the using.
 *
 * See docs/architecture/backend/03-modules.md#workspace.
 */
export class WorkspacePath {
  private constructor(readonly value: string) {}

  /**
   * @param raw candidate path, as it arrived from the outside
   * @throws {InvalidWorkspacePathError} when it is empty, contains a NUL byte, or is relative
   */
  static create(raw: string): WorkspacePath {
    if (raw.trim() === '') {
      throw new InvalidWorkspacePathError(raw, 'mustNotBeEmpty');
    }

    // A NUL truncates the path at the system-call boundary, so `/srv/projects\0/../../etc` would
    // be checked as one path and opened as another. Refusing it is cheaper than reasoning about it.
    if (raw.includes('\0')) {
      throw new InvalidWorkspacePathError(raw, 'mustNotContainNul');
    }

    // Checked on the **raw** input, before any normalisation: `resolve()` would join a relative
    // path onto the backend's working directory and hand back something absolute that nobody
    // asked for. See S-13.
    if (!isAbsolute(raw)) {
      throw new InvalidWorkspacePathError(raw, 'mustBeAbsolute');
    }

    // Collapses `.` and `..` and drops any trailing separator, so `/srv/projects/../../etc`
    // becomes `/etc` and is then compared against the roots as what it actually is. See S-11.
    return new WorkspacePath(resolve(raw));
  }

  /**
   * Whether this path is `other` or lives underneath it.
   *
   * The separator in the comparison is the whole point: without it `/srv/projects-evil` is a
   * textual prefix of `/srv/projects` and would pass as a child of it. That is the refusal that
   * goes unnoticed in a `startsWith`, and it is S-17.
   */
  isWithin(other: WorkspacePath): boolean {
    return this.value === other.value || this.value.startsWith(withTrailingSeparator(other.value));
  }

  equals(other: WorkspacePath): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/** `/srv/projects` → `/srv/projects/`, and a filesystem root already ends in one. */
function withTrailingSeparator(value: string): string {
  return value.endsWith(sep) ? value : `${value}${sep}`;
}
