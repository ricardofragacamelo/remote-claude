import { useState } from 'react';

/** A set of selected row ids, and the one way rows ever enter or leave it: toggling one at a time. */
export interface Selection {
  readonly ids: ReadonlySet<string>;
  toggle(id: string): void;
}

/**
 * The checkbox selection of a dense table — `mcp`'s own `McpServerTable` and an engine extension's own
 * `PluginTable` (plan 13, B-28, B-29) both toggle one row id in or out of a set the same way; shared
 * here instead of each screen hand-copying the same `Set` juggling.
 */
export function useSelection(): Selection {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());

  return {
    ids,
    toggle: (id) => {
      setIds((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
  };
}
