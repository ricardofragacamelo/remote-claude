import { compareNames } from '@domain/workspace';
import type { WorkspacePath } from '@domain/workspace';
import { FilePath } from '../value-objects/file-path.value-object';

/**
 * How many entries one level of the tree answers at most, unless the installation says otherwise
 * ([07 · D-10](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-10--exclusões-padrão-e-teto-da-árvore)).
 */
export const TREE_LISTING_LIMIT = 5000;

/**
 * Names the explorer hides unless "show hidden" is on — the `files.exclude` of VS Code.
 *
 * **Marked, never omitted** (S-38): hiding is the web's decision, so the toggle needs no other
 * route. The heavy folders that are shown and not watched (`node_modules`…) are the watcher's list,
 * not this one — hiding `node_modules` confuses whoever looks for a package (D-10).
 */
export const HIDDEN_NAMES: readonly string[] = ['.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db'];

/**
 * What the watcher never watches — the `files.watcherExclude` of VS Code, and `.git` whole.
 *
 * **Shown, never watched** (D-10): the tree lists `node_modules` and reloads it when it is expanded,
 * but one inotify watch per folder of it would spend the machine's budget, which the user's own
 * editor shares (R-03). `.git` is not watched either (B-20): what changes there is git's, and the
 * explorer shows the working tree. An entry of more than one segment is a run of segments, matched
 * at any depth, like a single name is.
 */
export const UNWATCHED_PATHS: readonly string[] = [
  '.git',
  'node_modules',
  '.git/objects',
  '.git/subtree-cache',
  'dist',
  'build',
  '.venv',
  'target',
];

/**
 * Whether the watcher leaves a path alone: it is, or it is inside, one of {@link UNWATCHED_PATHS}.
 *
 * @param relative POSIX, relative to the watched folder; `''` is the folder itself
 */
export function isUnwatched(relative: string): boolean {
  const segments = relative.split('/').filter((segment) => segment.length > 0);

  return UNWATCHED_PATHS.some((entry) => containsRun(segments, entry.split('/')));
}

function containsRun(segments: readonly string[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= segments.length; start += 1) {
    if (run.every((segment, index) => segments[start + index] === segment)) {
      return true;
    }
  }

  return false;
}

/** What an entry is, as `lstat` says — never following the entry itself. */
export type EntryKind = 'file' | 'directory' | 'symlink' | 'other';

/** What a symlink leads to; `missing` for a broken one or a loop. */
export type TargetKind = 'file' | 'directory' | 'other' | 'missing';

/** One child of a directory, as the port read it and before the rule decides on it. */
export interface TreeChild {
  readonly name: string;
  readonly kind: EntryKind;
  readonly size: number;
  readonly mtime: Date;
  /** The name is not valid UTF-8 (Linux accepts any bytes); it is shown and never operated on. */
  readonly unreadableName: boolean;
  /** For a symlink: the real path it leads to, and what is there. `null` otherwise. */
  readonly target: { readonly realPath: string | null; readonly kind: TargetKind } | null;
}

/** One entry of a level of the tree. */
export interface TreeEntry {
  readonly name: string;
  /** Relative to the open folder. */
  readonly path: string;
  readonly kind: EntryKind;
  readonly size: number;
  readonly mtime: Date;
  readonly hidden: boolean;
  readonly unreadableName: boolean;
  /**
   * For a symlink: whether it leads outside the open folder — then it is not navigable, and what
   * is there is not said (`targetKind: null`) — and what it leads to when it does not.
   */
  readonly symlink: { readonly outside: boolean; readonly targetKind: TargetKind | null } | null;
}

/** One level of the tree, never more. */
export interface TreeListing {
  readonly directory: FilePath;
  readonly entries: readonly TreeEntry[];
  /** The ceiling cut the level. */
  readonly truncated: boolean;
}

/** What {@link listTree} is given. */
export interface TreeListingInput {
  readonly directory: FilePath;
  readonly children: readonly TreeChild[];
  /** Read to the end, rather than stopped at the ceiling. */
  readonly exhausted: boolean;
  readonly limit: number;
}

/**
 * One level of the tree, from what the port read of it.
 *
 * Pure: the port reads, this decides. Folders first — a link to a folder inside counts as one —
 * then by name, ignoring case and with numbers in natural order, so the same level always lists the
 * same way (S-28, S-39). Nothing is omitted: hidden names are marked, links that leave the open
 * folder are marked, and a FIFO or a device is listed as `other` and never opened (S-34, S-35).
 */
export function listTree(input: TreeListingInput): TreeListing {
  const entries = input.children
    .map((child) => toEntry(input.directory, child))
    .sort(foldersFirstThenName);

  return {
    directory: input.directory,
    entries: entries.slice(0, input.limit),
    truncated: !input.exhausted || entries.length > input.limit,
  };
}

function toEntry(directory: FilePath, child: TreeChild): TreeEntry {
  return {
    name: child.name,
    path: directory.child(child.name).relative,
    kind: child.kind,
    size: child.size,
    mtime: child.mtime,
    hidden: HIDDEN_NAMES.includes(child.name),
    unreadableName: child.unreadableName,
    symlink: child.target === null ? null : linkOf(directory.folder, child.target),
  };
}

/** Where a link leads, said only when that is inside the open folder. */
function linkOf(
  folder: WorkspacePath,
  target: NonNullable<TreeChild['target']>,
): NonNullable<TreeEntry['symlink']> {
  if (target.realPath === null) {
    return { outside: false, targetKind: 'missing' };
  }

  return FilePath.staysInside(folder, target.realPath)
    ? { outside: false, targetKind: target.kind }
    : { outside: true, targetKind: null };
}

/** Whether an entry sorts with the folders: a folder, or a link to one that stays inside. */
function sortsAsFolder(entry: TreeEntry): boolean {
  return entry.kind === 'directory' || entry.symlink?.targetKind === 'directory';
}

function foldersFirstThenName(left: TreeEntry, right: TreeEntry): number {
  const folders = Number(sortsAsFolder(right)) - Number(sortsAsFolder(left));

  return folders !== 0 ? folders : compareNames(left.name, right.name);
}
