import type { EntryRow, TreeRow } from './tree-rows';

/**
 * Moving through the rows of the tree from the keyboard, as the ARIA tree pattern has it — pure, so
 * every key is proved without a render (S-162).
 *
 * Only entries and a level that failed take the focus: a failed level is retried with Enter. A level
 * loading, or the note of a level cut by the ceiling, is read, never stopped on.
 */

/** Whether a row can take the focus. */
export function isFocusable(row: TreeRow): boolean {
  return row.type === 'entry' || row.type === 'error';
}

/** The entry rows, in order. */
export function entryRows(rows: readonly TreeRow[]): readonly EntryRow[] {
  return rows.filter((row): row is EntryRow => row.type === 'entry');
}

/** Where a row is, by key; `-1` when it is not on screen. */
export function indexOfKey(rows: readonly TreeRow[], key: string | null): number {
  return key === null ? -1 : rows.findIndex((row) => row.key === key);
}

/**
 * The next row that takes the focus from `from`, `step` at a time — or `from` itself at either end.
 * From nowhere (`-1`), the first.
 */
export function stepFrom(rows: readonly TreeRow[], from: number, step: 1 | -1): number {
  const start = from !== -1 ? from : step === 1 ? -1 : rows.length;

  for (let index = start + step; index >= 0 && index < rows.length; index += step) {
    const row = rows[index];

    if (row !== undefined && isFocusable(row)) {
      return index;
    }
  }

  return from;
}

/** The first and the last rows that take the focus. */
export function edgeOf(rows: readonly TreeRow[], edge: 'first' | 'last'): number {
  return stepFrom(rows, -1, edge === 'first' ? 1 : -1);
}

/** The row of the folder a row is listed in — `-1` at the top level. */
export function parentIndex(rows: readonly TreeRow[], index: number): number {
  const parent = rows[index]?.parent ?? '';

  if (parent === '') {
    return -1;
  }

  return rows.findIndex((row) => row.type === 'entry' && row.path === parent);
}

/** What a person reads on a row, for typing to find it. */
export function labelOf(row: EntryRow): string {
  return row.names.join('/');
}

/**
 * The next entry, after `from` and around the end, whose name starts with what was typed — the
 * type-ahead of the pattern. `from` itself when nothing does.
 */
export function typeAhead(rows: readonly TreeRow[], from: number, typed: string): number {
  const needle = typed.toLowerCase();
  const count = rows.length;

  for (let offset = 1; offset <= count; offset += 1) {
    const index = (from + offset + count) % count;
    const row = rows[index];

    if (row?.type === 'entry' && labelOf(row).toLowerCase().startsWith(needle)) {
      return index;
    }
  }

  return from;
}

/** The entries between two rows, both included, in the order of the tree — a Shift selection. */
export function rangeOf(rows: readonly TreeRow[], from: number, to: number): readonly string[] {
  const [low, high] = from <= to ? [from, to] : [to, from];

  return entryRows(rows.slice(Math.max(low, 0), high + 1)).map((row) => row.path);
}
