import type {
  DirectoryListing,
  ExplorerError,
  NewEntryKind,
  SortOrder,
  TreeEntry,
} from '../types/explorer';
import { isExpandable, sortEntries } from './sort';

/** Where one folder's level is, as the cache has it. */
export type DirectoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: ExplorerError }
  | { readonly status: 'ready'; readonly listing: DirectoryListing };

/** Everything the rows of the tree are made of. */
export interface TreeSource {
  /** A folder's level — `''` for the open folder. */
  directory(path: string): DirectoryState;
  readonly expanded: ReadonlySet<string>;
  readonly showHidden: boolean;
  readonly sort: SortOrder;

  /** Only entries whose name holds it, and the folders that lead to them; `''` for everything. */
  readonly filter: string;

  /** Folders with a single folder inside shown as one row, `a/b/c` (S-164). */
  readonly compact: boolean;

  /** A new entry being named, at the top of its folder. */
  readonly creating: { readonly parent: string; readonly kind: NewEntryKind } | null;

  /** The entry being renamed in place. */
  readonly renaming: string | null;
}

/** An entry of the tree, as one row — a chain of single folders compacted into one. */
export interface EntryRow {
  readonly type: 'entry';
  readonly key: string;

  /** The entry the row acts on: the innermost of a compacted chain. */
  readonly path: string;

  /** The outermost of a compacted chain — the folder whose being open opens the row. */
  readonly head: string;
  readonly entry: TreeEntry;

  /** The names on the row, outermost first — one, unless folders were compacted. */
  readonly names: readonly string[];

  /** The folder the row is listed in. */
  readonly parent: string;
  readonly level: number;
  readonly setSize: number;
  readonly posInSet: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly renaming: boolean;
}

/** Where a row that is not an entry is. */
interface NotePlace {
  readonly key: string;
  readonly parent: string;
  readonly level: number;
}

/** A row that is not an entry: a level loading or failed, cut by the ceiling, or a name being typed. */
export type NoteRow =
  | (NotePlace & { readonly type: 'loading' | 'truncated' })
  | (NotePlace & { readonly type: 'error'; readonly error: ExplorerError })
  | (NotePlace & { readonly type: 'creating'; readonly kind: NewEntryKind });

export type TreeRow = EntryRow | NoteRow;

/** The rows, and every folder whose level they need — what the tree asks the server for. */
export interface TreeRows {
  readonly rows: readonly TreeRow[];
  readonly wanted: readonly string[];
}

/** The entries of a level the tree shows, in order. */
function shownOf(listing: DirectoryListing, source: TreeSource): TreeEntry[] {
  return sortEntries(
    listing.entries.filter((entry) => source.showHidden || !entry.hidden),
    source.sort,
  );
}

/** Whether a name holds the filter — ignoring case, as a person types it. */
function matches(entry: TreeEntry, needle: string): boolean {
  return entry.name.toLowerCase().includes(needle);
}

/** Whether something already read under `path` holds the filter. */
function holdsMatch(path: string, source: TreeSource, needle: string): boolean {
  const state = source.directory(path);

  if (state.status !== 'ready') {
    return false;
  }

  return shownOf(state.listing, source).some(
    (entry) =>
      matches(entry, needle) || (isExpandable(entry) && holdsMatch(entry.path, source, needle)),
  );
}

/** The single folder a level holds — what lets it be compacted into its parent's row. */
function onlyFolderIn(state: DirectoryState, source: TreeSource): TreeEntry | null {
  if (state.status !== 'ready' || state.listing.truncated) {
    return null;
  }

  const shown = shownOf(state.listing, source);
  const [only] = shown;

  return shown.length === 1 && only !== undefined && isExpandable(only) ? only : null;
}

/**
 * The chain of single folders that starts at `entry` — just `entry` when nothing compacts — and the
 * innermost of it, which the row acts on.
 */
function chainOf(
  entry: TreeEntry,
  source: TreeSource,
  wanted: string[],
): { readonly chain: readonly TreeEntry[]; readonly tail: TreeEntry } {
  const chain = [entry];
  const open = source.expanded.has(entry.path);
  let current = entry;

  while (source.compact && isExpandable(current)) {
    if (open) {
      wanted.push(current.path);
    }

    const next = onlyFolderIn(source.directory(current.path), source);

    if (next === null) {
      break;
    }

    chain.push(next);
    current = next;
  }

  return { chain, tail: current };
}

/** What a level that is not ready to be listed shows instead. */
function noteOf(
  state: Exclude<DirectoryState, { readonly status: 'ready' }>,
  parent: string,
  level: number,
): NoteRow {
  return state.status === 'loading'
    ? { type: 'loading', key: `${parent}\u0000loading`, parent, level }
    : { type: 'error', key: `${parent}\u0000error`, parent, level, error: state.error };
}

/** Adds one level's rows — and, depth first, the rows of every folder open in it. */
function addLevel(
  parent: string,
  level: number,
  source: TreeSource,
  out: { rows: TreeRow[]; wanted: string[] },
): void {
  const state = source.directory(parent);

  if (source.creating?.parent === parent) {
    out.rows.push({
      type: 'creating',
      key: `${parent}\u0000creating`,
      parent,
      level,
      kind: source.creating.kind,
    });
  }

  if (state.status !== 'ready') {
    out.rows.push(noteOf(state, parent, level));
    return;
  }

  const needle = source.filter.trim().toLowerCase();
  const shown = shownOf(state.listing, source).filter(
    (entry) =>
      needle === '' ||
      matches(entry, needle) ||
      (isExpandable(entry) && holdsMatch(entry.path, source, needle)),
  );

  shown.forEach((entry, index) => {
    addEntry(entry, { parent, level, setSize: shown.length, posInSet: index + 1 }, source, out);
  });

  if (state.listing.truncated) {
    out.rows.push({ type: 'truncated', key: `${parent}\u0000truncated`, parent, level });
  }
}

/** Adds one entry's row, and what it holds when it is open. */
function addEntry(
  entry: TreeEntry,
  place: Pick<EntryRow, 'parent' | 'level' | 'setSize' | 'posInSet'>,
  source: TreeSource,
  out: { rows: TreeRow[]; wanted: string[] },
): void {
  const { chain, tail } = chainOf(entry, source, out.wanted);
  const expandable = isExpandable(tail);
  const expanded = expandable && source.expanded.has(entry.path);

  out.rows.push({
    type: 'entry',
    key: tail.path,
    path: tail.path,
    head: entry.path,
    entry: tail,
    names: chain.map((each) => each.name),
    ...place,
    expandable,
    expanded,
    renaming: source.renaming === tail.path,
  });

  if (expanded) {
    out.wanted.push(tail.path);
    addLevel(tail.path, place.level + 1, source, out);
  }
}

/**
 * The rows of the tree, flat and in order, each with its level and its place among its siblings — the
 * shape a virtualized ARIA tree needs (S-161) — and the folders whose level the rows need.
 *
 * Pure: the same source, the same rows. Hidden entries are left out unless shown (S-166); a filter
 * keeps what matches and the folders already read that lead to it (S-165).
 */
export function treeRowsOf(source: TreeSource): TreeRows {
  const out = { rows: [] as TreeRow[], wanted: [''] };

  addLevel('', 1, source, out);

  return { rows: out.rows, wanted: [...new Set(out.wanted)] };
}
