import type { PdfOutlineItem } from '../types/pdf';

/** One entry of the outline as the tree draws it — only the ones whose parents are open. */
export interface OutlineRow {
  /** Where it is in the outline: the indexes from the top, `0.2.1`. */
  readonly key: string;
  readonly item: PdfOutlineItem;

  /** From 1, as `aria-level`. */
  readonly level: number;

  /** Its place among its siblings, from 1, and how many they are — `aria-posinset`, `aria-setsize`. */
  readonly position: number;
  readonly siblings: number;
  readonly parent: string | null;
  readonly expandable: boolean;
  readonly expanded: boolean;
}

/**
 * The rows of an outline, depth first, with the entries under a closed one left out — what keeps an
 * outline of hundreds of entries drawn as its first level until someone opens one (S-37).
 */
export function outlineRows(
  items: readonly PdfOutlineItem[],
  expanded: ReadonlySet<string>,
  parent: string | null = null,
  level = 1,
): OutlineRow[] {
  return items.flatMap((item, index) => {
    const key = parent === null ? String(index) : `${parent}.${String(index)}`;
    const open = expanded.has(key);
    const row: OutlineRow = {
      key,
      item,
      level,
      position: index + 1,
      siblings: items.length,
      parent,
      expandable: item.items.length > 0,
      expanded: open && item.items.length > 0,
    };

    return [row, ...(row.expanded ? outlineRows(item.items, expanded, key, level + 1) : [])];
  });
}

/** What a key pressed on an entry of the tree does. */
export type OutlineMove =
  | { readonly focus: string }
  | { readonly expand: string }
  | { readonly collapse: string }
  | { readonly open: OutlineRow }
  | null;

/** Moves to the row `by` places away, if there is one. */
function stepped(rows: readonly OutlineRow[], at: number, by: number): OutlineMove {
  const row = rows[at + by];
  return row === undefined ? null : { focus: row.key };
}

/** Right: opens a closed entry, or goes into an open one. */
function right(rows: readonly OutlineRow[], at: number, row: OutlineRow): OutlineMove {
  if (!row.expandable) return null;
  return row.expanded ? stepped(rows, at, 1) : { expand: row.key };
}

/** Left: closes an open entry, or goes up to its parent. */
function left(row: OutlineRow): OutlineMove {
  if (row.expanded) return { collapse: row.key };
  return row.parent === null ? null : { focus: row.parent };
}

/**
 * What a key does on the entry `focused` — the keyboard of the tree pattern of WAI-ARIA (S-33):
 * up and down move, right opens or goes in, left closes or goes up, Home and End go to the ends,
 * Enter and Space go to where the entry leads. `null` for a key the tree does not take.
 */
export function outlineMove(
  rows: readonly OutlineRow[],
  focused: string,
  key: string,
): OutlineMove {
  const at = rows.findIndex((row) => row.key === focused);
  const row = rows[at];

  if (row === undefined) return null;

  const moves: Readonly<Record<string, () => OutlineMove>> = {
    ArrowDown: () => stepped(rows, at, 1),
    ArrowUp: () => stepped(rows, at, -1),
    Home: () => stepped(rows, 0, 0),
    End: () => stepped(rows, rows.length - 1, 0),
    ArrowRight: () => right(rows, at, row),
    ArrowLeft: () => left(row),
    Enter: () => ({ open: row }),
    ' ': () => ({ open: row }),
  };

  return moves[key]?.() ?? null;
}
