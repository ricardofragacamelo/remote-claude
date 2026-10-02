import type { SortOrder, TreeEntry } from '../types/explorer';

/** Whether an entry opens as a folder: a folder, or a link inside the folder that leads to one. */
export function isFolderLike(entry: TreeEntry): boolean {
  return (
    entry.kind === 'directory' ||
    (entry.kind === 'symlink' && entry.targetKind === 'directory' && !entry.outside)
  );
}

/** Whether the tree can expand an entry — never one whose name is not text (S-274). */
export function isExpandable(entry: TreeEntry): boolean {
  return isFolderLike(entry) && !entry.unreadableName;
}

/** What the person can act on: not a name that is not text, not a link out of the folder. */
export function isOperable(entry: TreeEntry): boolean {
  return !entry.unreadableName && !entry.outside;
}

/** The extension, for the sort by type: what follows the last dot, a leading dot not counting. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function byName(left: TreeEntry, right: TreeEntry): number {
  return collator.compare(left.name, right.name) || left.name.localeCompare(right.name);
}

const ORDERS: Readonly<Record<SortOrder, (left: TreeEntry, right: TreeEntry) => number>> = {
  name: byName,
  type: (left, right) =>
    collator.compare(extensionOf(left.name), extensionOf(right.name)) || byName(left, right),
  // Newest first, as the editor people know does.
  modified: (left, right) =>
    Date.parse(right.mtime) - Date.parse(left.mtime) || byName(left, right),
};

/** The entries of one level in `order` — folders first, whatever the order. */
export function sortEntries(entries: readonly TreeEntry[], order: SortOrder): TreeEntry[] {
  const compare = ORDERS[order];

  return [...entries].sort(
    (left, right) =>
      Number(isFolderLike(right)) - Number(isFolderLike(left)) || compare(left, right),
  );
}
