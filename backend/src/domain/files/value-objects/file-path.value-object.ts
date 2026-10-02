import { posix } from 'node:path';

import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import { InvalidFilePathError } from '../errors/invalid-file-path.error';
import type { FilePathRule, FilePathViolation } from '../errors/invalid-file-path.error';

/** The longest one segment of a path may be, in bytes — what Linux and macOS filesystems allow. */
export const MAX_SEGMENT_BYTES = 255;

/**
 * An entry inside the folder a tab opened: the folder, already resolved, and a relative POSIX path.
 *
 * The fence of the `files` module is the **open folder**, not the root of the allowlist that
 * contains it ([07 · D-11](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-11--a-raiz-do-explorer-é-a-pasta-aberta)):
 * a `path` that climbs out of the folder is refused even when it would land inside the same root.
 *
 * Like {@link WorkspacePath}, the rule is pure — string in, string out — so a path that was never
 * going to be allowed costs nothing and touches nothing. It is the first half of the containment;
 * the second is the adapter's, against the `realpath` and the open descriptor, at every operation,
 * because a symlink is a fact of the disk and not of the string (B-07).
 *
 * `''` is the open folder itself.
 */
export class FilePath {
  private constructor(
    /** The open folder — a real path, already cleared by the allowlist. */
    readonly folder: WorkspacePath,
    /** Normalised, relative, POSIX, without a leading or trailing `/`; `''` for the folder. */
    readonly relative: string,
  ) {}

  /**
   * @param folder the open folder, as `workspace` resolved it
   * @param raw the relative path, as it arrived from the outside
   * @param field the request field it came in, for `details[]`
   * @throws {InvalidFilePathError} absolute, with a NUL or with a backslash — every rule broken
   * @throws {WorkspaceNotAllowedError} it climbs out of the open folder (S-16, S-20)
   */
  static create(folder: WorkspacePath, raw: string, field = 'path'): FilePath {
    const violations = formatViolations(raw, field);

    if (violations.length > 0) {
      throw new InvalidFilePathError(violations);
    }

    return FilePath.normalised(folder, raw);
  }

  /**
   * A path that is about to **name** an entry — of a create, the destination of a move or a copy.
   *
   * On top of {@link create}'s rules, the last segment has to be a usable name (not empty, `.` or
   * `..`) and no segment may be longer than {@link MAX_SEGMENT_BYTES}. Every rule broken is
   * reported at once (S-86, S-87).
   *
   * @throws {InvalidFilePathError} any rule of either kind
   * @throws {WorkspaceNotAllowedError} it climbs out of the open folder
   */
  static naming(folder: WorkspacePath, raw: string, field = 'path'): FilePath {
    const violations = [...formatViolations(raw, field), ...namingViolations(raw, field)];

    if (violations.length > 0) {
      throw new InvalidFilePathError(violations);
    }

    return FilePath.normalised(folder, raw);
  }

  /**
   * Every rule a path **sent by a browser** breaks — an item of an upload, relative to the folder
   * it is sent into ([07 · B-49](../../../../../docs/plans/07-explorer-and-editor/F7-previews-and-transfer.md#b-49--upload-)).
   *
   * Stricter than {@link naming}, because a folder dragged from the desktop arrives as one path per
   * file and each segment of it becomes a name on this disk: none may be empty, `.` or `..` (a
   * `..` that would stay inside is refused too — a browser has no reason to send one), and none may
   * be a name Windows reserves (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…`COM9`, `LPT1`…`LPT9`, with any
   * extension), so a folder uploaded here can be checked out on the person's other machine.
   * Reported, not thrown, so a manifest of a hundred items answers every mistake of every item in
   * one `400`.
   */
  static uploadViolations(raw: string, field: string): FilePathViolation[] {
    return [...formatViolations(raw, field), ...segmentViolations(raw, field)];
  }

  private static normalised(folder: WorkspacePath, raw: string): FilePath {
    // `posix.normalize` collapses `a/../b` to `b` (S-17) and leaves a leading `..` in place, which
    // is exactly what escaping looks like.
    const normalised = posix.normalize(raw === '' ? '.' : raw).replace(/\/+$/, '');
    const relative = normalised === '.' ? '' : normalised;

    if (relative === '..' || relative.startsWith('../')) {
      throw new WorkspaceNotAllowedError(posix.join(folder.value, raw));
    }

    return new FilePath(folder, relative);
  }

  /** The path on the machine, before any link is resolved. */
  get absolute(): string {
    return this.relative === '' ? this.folder.value : posix.join(this.folder.value, this.relative);
  }

  /** Whether this is the open folder itself. */
  get isFolder(): boolean {
    return this.relative === '';
  }

  /** The last segment; `''` for the folder. */
  get name(): string {
    return posix.basename(this.relative);
  }

  /** The folder this entry is in. The open folder is its own parent: nothing above it is reached. */
  parent(): FilePath {
    const parent = posix.dirname(this.relative);

    return new FilePath(this.folder, parent === '.' ? '' : parent);
  }

  /** The entry called `name` inside this one. */
  child(name: string): FilePath {
    return new FilePath(this.folder, this.relative === '' ? name : `${this.relative}/${name}`);
  }

  /** The same entry, under another name in the same folder. */
  sibling(name: string): FilePath {
    return this.parent().child(name);
  }

  /** Whether `other` is this entry or lives underneath it. The separator is the point (S-92). */
  contains(other: FilePath): boolean {
    return (
      this.relative === '' ||
      other.relative === this.relative ||
      other.relative.startsWith(`${this.relative}/`)
    );
  }

  equals(other: FilePath): boolean {
    return this.folder.equals(other.folder) && this.relative === other.relative;
  }

  /**
   * Whether a real path the disk reported stays inside the open folder.
   *
   * The comparison is {@link WorkspacePath.isWithin}'s, never a string test of our own: there is
   * one containment rule in the fence, and it is the one with the separator in it.
   */
  static staysInside(folder: WorkspacePath, realPath: string): boolean {
    return posix.isAbsolute(realPath) && WorkspacePath.create(realPath).isWithin(folder);
  }

  toString(): string {
    return this.relative;
  }
}

/** What makes a string not a relative POSIX path at all. Checked on the raw input. */
function formatViolations(raw: string, field: string): FilePathViolation[] {
  const rules: FilePathRule[] = [];

  if (raw.startsWith('/')) {
    rules.push('mustBeRelative');
  }

  // A NUL truncates the path at the system-call boundary: checked as one path, opened as another.
  if (raw.includes('\0')) {
    rules.push('mustNotContainNul');
  }

  // A backslash is a separator on Windows and a plain character here; a client that sends one meant
  // something this server would not do.
  if (raw.includes('\\')) {
    rules.push('mustNotContainBackslash');
  }

  return rules.map((rule) => ({ field, rule }));
}

/** What makes a path unable to name a new entry. */
function namingViolations(raw: string, field: string): FilePathViolation[] {
  const segments = raw.split('/');
  const last = segments.at(-1) ?? '';
  const rules: FilePathRule[] = [];

  if (last === '' || last === '.' || last === '..') {
    rules.push('mustNameAnEntry');
  }

  if (segments.some(isTooLong)) {
    rules.push('segmentTooLong');
  }

  return rules.map((rule) => ({ field, rule }));
}

/**
 * The names Windows will not create a file under, whatever the extension: `CON.txt` is `CON`.
 * Compared without case, as Windows does.
 */
export const WINDOWS_RESERVED_NAMES: readonly string[] = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((digit) => [`COM${String(digit)}`, `LPT${String(digit)}`]),
];

/** Whether Windows reserves a segment: its stem, before the first dot and trailing blanks. */
export function isReservedOnWindows(segment: string): boolean {
  const stem = (segment.split('.')[0] ?? '').trimEnd().toUpperCase();

  return WINDOWS_RESERVED_NAMES.includes(stem);
}

/** What makes one of the segments of an uploaded path unusable as a name. */
function segmentViolations(raw: string, field: string): FilePathViolation[] {
  // An absolute path is already `mustBeRelative`; its leading `/` is not an empty segment besides.
  const segments = (raw.startsWith('/') ? raw.slice(1) : raw).split('/');
  const rules: FilePathRule[] = [];

  if (segments.some((segment) => segment === '' || segment === '.')) {
    rules.push('mustNotHaveEmptySegment');
  }

  if (segments.includes('..')) {
    rules.push('mustNotClimb');
  }

  if (segments.some(isTooLong)) {
    rules.push('segmentTooLong');
  }

  if (segments.some(isReservedOnWindows)) {
    rules.push('mustNotUseReservedName');
  }

  return rules.map((rule) => ({ field, rule }));
}

/** A segment longer than a filesystem of Linux or macOS holds. */
function isTooLong(segment: string): boolean {
  return Buffer.byteLength(segment, 'utf8') > MAX_SEGMENT_BYTES;
}
