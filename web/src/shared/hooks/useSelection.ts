import { useState } from 'react';

/** What a click carried, when the caller knows — absent, it is a plain toggle. */
export interface ToggleOptions {
  /** Shift was held: select the run between the last plain click and this one (B-24, S-177). */
  readonly shiftKey?: boolean;

  /** The ids in their current, on-screen order — what a shift-click's run is read against. Only
   * asked for when `shiftKey` is true; a caller that never shift-clicks never has to pass it. */
  readonly rowIds?: readonly string[];
}

/** A set of selected row ids. */
export interface Selection {
  readonly ids: ReadonlySet<string>;

  /**
   * Toggles one row in or out — or, shift-held with `rowIds` given, every row between it and the
   * last plain toggle, inclusive (B-24). The plain form (no `options`) is `mcp`'s own
   * `McpServerTable` and an engine extension's own `PluginTable` (plan 13, B-28, B-29) toggling one
   * id at a time, unchanged.
   */
  toggle(id: string, options?: ToggleOptions): void;

  /** Selects exactly `rowIds` — what the list currently shows, filtered (S-177), never more. */
  selectAll(rowIds: readonly string[]): void;

  /** Empties the selection. */
  clear(): void;
}

/**
 * The checkbox selection of a dense table — shared so no screen hand-copies the same `Set`
 * juggling, or its own shift-click range and "select all" on top of it.
 */
export function useSelection(): Selection {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  const toggle = (id: string, options?: ToggleOptions): void => {
    if (options?.shiftKey === true && anchor !== null && options.rowIds !== undefined) {
      const range = rangeBetween(options.rowIds, anchor, id);

      if (range !== null) {
        setIds((current) => new Set([...current, ...range]));
        return;
      }
    }

    setAnchor(id);
    setIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const selectAll = (rowIds: readonly string[]): void => {
    setIds(new Set(rowIds));
  };

  const clear = (): void => {
    setIds(new Set());
    setAnchor(null);
  };

  return { ids, toggle, selectAll, clear };
}

/** The ids of `rowIds` from `anchor` to `target`, inclusive, in either direction — `null` when
 * either end is not in `rowIds` (the row list changed since the anchor was set). */
function rangeBetween(
  rowIds: readonly string[],
  anchor: string,
  target: string,
): readonly string[] | null {
  const from = rowIds.indexOf(anchor);
  const to = rowIds.indexOf(target);

  if (from === -1 || to === -1) {
    return null;
  }

  const [start, end] = from <= to ? [from, to] : [to, from];
  return rowIds.slice(start, end + 1);
}
