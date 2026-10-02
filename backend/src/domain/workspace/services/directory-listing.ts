import { dirname, isAbsolute, join } from 'node:path';

import type { Workspace } from '../entities/workspace.entity';
import { WorkspacePath } from '../value-objects/workspace-path.value-object';

/**
 * How many entries one listing answers at most.
 *
 * The ceiling protects the backend — the port stops reading at one past it, so the cost of a
 * listing never grows with the directory — and the phone, which has no use for ten thousand rows.
 * What it cuts is reached through `prefix` ([06 · D-05](../../../../../docs/plans/06-workbench/decisions.md)).
 * Measured for the gap of D-05: the largest real directory a developer opens here, the
 * `node_modules/.pnpm` of this monorepo, has 977 subdirectories.
 */
export const DIRECTORY_LISTING_LIMIT = 1000;

/**
 * One child of a directory, as the port read it and before the rule decides on it.
 *
 * A symlink carries the real path of its target when that target is a directory, and `null` when
 * the link is broken, loops or points at anything else — the port never has to decide whether the
 * target is inside the fence, only report where it leads.
 */
export type DirectoryChild =
  | { readonly kind: 'directory'; readonly name: string }
  | { readonly kind: 'symlink'; readonly name: string; readonly target: string | null };

/**
 * Which names a listing admits — what can be known before the disk is read.
 *
 * It is handed to the port so the ceiling counts only what can be listed, and applied again by
 * {@link listDirectory}, so the rule holds whatever the port did with it.
 */
export class DirectoryListingCriteria {
  private readonly prefix: string | null;

  /**
   * @param showHidden whether a name starting with `.` is listed ([06 · D-04](../../../../../docs/plans/06-workbench/decisions.md))
   * @param prefix only names that start with it, ignoring case — how an entry past the ceiling is
   *   reached; `null` for every name
   */
  constructor(
    readonly showHidden: boolean,
    prefix: string | null,
  ) {
    this.prefix = prefix === null ? null : prefix.toLowerCase();
  }

  admits(name: string): boolean {
    if (!this.showHidden && isHidden(name)) {
      return false;
    }

    return this.prefix === null || name.toLowerCase().startsWith(this.prefix);
  }
}

/** One subdirectory of a listing. */
export interface DirectoryEntry {
  readonly name: string;
  /** The path as listed — for a symlink, the link, never its target. */
  readonly path: string;
  readonly hidden: boolean;
  readonly symlink: boolean;
}

/** One level of one directory, never the tree. */
export interface DirectoryListing {
  /** The directory listed, every symlink resolved. */
  readonly path: WorkspacePath;
  readonly workspace: Workspace;
  /** `null` at the root: nothing above it is ever listed. */
  readonly parent: WorkspacePath | null;
  readonly entries: readonly DirectoryEntry[];
  /** The ceiling cut the listing; a `prefix` reaches what was left out. */
  readonly truncated: boolean;
}

/** What {@link listDirectory} is given. */
export interface DirectoryListingInput {
  /** The real path of the directory, already inside `workspace`. */
  readonly directory: WorkspacePath;
  readonly workspace: Workspace;
  readonly criteria: DirectoryListingCriteria;
  /** Every child the port read, in the order it read them. */
  readonly children: readonly DirectoryChild[];
  /** Whether the port read the directory to its end, rather than stopping at the ceiling. */
  readonly exhausted: boolean;
  readonly limit: number;
}

/**
 * The listing of one directory, from what the port read of it.
 *
 * Pure, like the rest of the fence: the port reads, this decides. Only directories reach here as
 * such, so a file, a socket, a fifo or a device is never listed. A symlink is listed only when its
 * target is a directory inside the **same root** — one that escapes is omitted rather than marked,
 * because "exists, and you may not" already tells what is outside the fence (D-04).
 *
 * @throws never — a child the rule cannot use is omitted, not refused
 */
export function listDirectory(input: DirectoryListingInput): DirectoryListing {
  const listed = input.children
    .filter((child) => input.criteria.admits(child.name) && staysInside(child, input.workspace))
    .map((child) => toEntry(input.directory, child))
    .sort(byName);

  return {
    path: input.directory,
    workspace: input.workspace,
    parent: input.directory.equals(input.workspace.root)
      ? null
      : WorkspacePath.create(dirname(input.directory.value)),
    entries: listed.slice(0, input.limit),
    truncated: !input.exhausted || listed.length > input.limit,
  };
}

/** A name the operating system's own picker hides by default. */
function isHidden(name: string): boolean {
  return name.startsWith('.');
}

/**
 * Whether a child may be listed without saying anything about what lies outside the root.
 *
 * The comparison is the root's own `contains`, never a string test of our own: there is exactly one
 * containment rule in the fence, and it is the one with the separator in it.
 */
function staysInside(child: DirectoryChild, workspace: Workspace): boolean {
  if (child.kind === 'directory') {
    return true;
  }

  return (
    child.target !== null &&
    isAbsolute(child.target) &&
    workspace.contains(WorkspacePath.create(child.target))
  );
}

function toEntry(directory: WorkspacePath, child: DirectoryChild): DirectoryEntry {
  return {
    name: child.name,
    path: join(directory.value, child.name),
    hidden: isHidden(child.name),
    symlink: child.kind === 'symlink',
  };
}

/**
 * Case-insensitive, with numbers in natural order — `dir2` before `dir10` — so the same directory
 * always lists the same way. Two names that differ only in case keep a fixed order between them.
 */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function byName(left: DirectoryEntry, right: DirectoryEntry): number {
  return compareNames(left.name, right.name);
}

/**
 * The order two names of one directory list in — the picker's here, and the explorer's tree in
 * `files`, so the two never sort the same folder differently.
 */
export function compareNames(left: string, right: string): number {
  const natural = collator.compare(left, right);

  if (natural !== 0) {
    return natural;
  }

  // Two children of one directory never share a name, so this never answers "equal".
  return left < right ? -1 : 1;
}
