import { posix } from 'node:path';

import type { FilePath } from '../value-objects/file-path.value-object';

/**
 * How the entries of a zip are named — plan 07, B-48.
 *
 * A selection of the explorer (`path` repeated) is zipped with names **relative to the deepest
 * folder that holds every item**: `src/a.ts` and `src/lib` give `a.ts` and `lib/…`, the way the
 * file managers people know do it. The open folder itself (`''`) has no folder above it inside the
 * fence, so its entries go under its own name.
 */
export interface ArchiveNaming {
  /** The name of an entry inside the zip, from its path relative to the open folder. */
  readonly nameOf: (relative: string) => string;
  /** What the zip is called when it is saved: the item's name, or the common folder's. */
  readonly fileName: string;
}

/** What a zip falls back to being called when nothing has a name — the root of a disk. */
const UNNAMED = 'archive';

/**
 * The selection without repeats, and without what another selected entry already holds — zipping
 * `src` and `src/a.ts` is zipping `src`, once. In the order the person selected them.
 */
export function outermost(selection: readonly FilePath[]): FilePath[] {
  return selection.filter(
    (entry, index) =>
      !selection.some(
        (other, at) =>
          at !== index && other.contains(entry) && (!other.equals(entry) || at < index),
      ),
  );
}

/**
 * @param selection the paths of the selected items, relative to the open folder, already
 *   {@link outermost}
 * @param folder the open folder's real path
 */
export function archiveNaming(selection: readonly string[], folder: string): ArchiveNaming {
  const folderName = posix.basename(folder) || UNNAMED;

  if (selection.includes('')) {
    return {
      nameOf: (relative) => (relative === '' ? folderName : `${folderName}/${relative}`),
      fileName: `${folderName}.zip`,
    };
  }

  const common = commonPrefix(selection.map((path) => segmentsOf(path).slice(0, -1)));
  const only = selection.length === 1 ? segmentsOf(selection[0] ?? '').at(-1) : undefined;

  return {
    nameOf: (relative) => segmentsOf(relative).slice(common.length).join('/'),
    fileName: `${only ?? common.at(-1) ?? folderName}.zip`,
  };
}

function segmentsOf(relative: string): string[] {
  return relative === '' ? [] : relative.split('/');
}

/** The segments every list starts with. */
function commonPrefix(lists: readonly (readonly string[])[]): string[] {
  const [first = [], ...rest] = lists;
  let length = first.length;

  for (const list of rest) {
    length = Math.min(length, sharedLength(first, list));
  }

  return first.slice(0, length);
}

function sharedLength(left: readonly string[], right: readonly string[]): number {
  let length = 0;

  while (length < left.length && length < right.length && left[length] === right[length]) {
    length += 1;
  }

  return length;
}
