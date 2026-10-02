import { useCallback, useRef } from 'react';
import type { KeyboardEvent } from 'react';

import {
  edgeOf,
  entryRows,
  indexOfKey,
  parentIndex,
  rangeOf,
  stepFrom,
  typeAhead,
} from '../lib/tree-navigation';
import type { TreeRow } from '../lib/tree-rows';
import { explorerStore } from '../store/explorer.store';
import type { ExplorerTree } from './useExplorerTree';

/** How long the letters typed to find a row are remembered — the pattern's type-ahead. */
export const TYPE_AHEAD_MS = 700;

/** What a key does, given where the keyboard is. */
interface Moment {
  readonly rows: readonly TreeRow[];
  readonly at: number;
  readonly row: TreeRow | undefined;
}

/** The keys that only move — to a row, by its index. */
const MOVES: Readonly<Record<string, (moment: Moment) => number>> = {
  ArrowDown: ({ rows, at }) => stepFrom(rows, at, 1),
  ArrowUp: ({ rows, at }) => stepFrom(rows, at, -1),
  Home: ({ rows }) => edgeOf(rows, 'first'),
  End: ({ rows }) => edgeOf(rows, 'last'),
};

/** `→`: opens a closed folder; on an open one, goes to what it holds first. */
function right({ rows, at, row }: Moment, open: (head: string) => void): number | null {
  if (row?.type !== 'entry' || !row.expandable) {
    return null;
  }

  if (!row.expanded) {
    open(row.head);
    return null;
  }

  return rows[at + 1]?.parent === row.path ? at + 1 : null;
}

/** `←`: closes an open folder; anywhere else, goes to the folder the row is in. */
function left({ rows, at, row }: Moment, close: (head: string) => void): number | null {
  if (row?.type === 'entry' && row.expanded) {
    close(row.head);
    return null;
  }

  const parent = parentIndex(rows, at);
  return parent === -1 ? null : parent;
}

/** Whether a press is a character to find a row by — a letter, a digit, a dot — and nothing held. */
function isTyped(event: KeyboardEvent): boolean {
  return (
    event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey
  );
}

/** Whether the press is in a field inside the tree — the name typed in place — and none of its keys. */
function fromField(event: KeyboardEvent): boolean {
  return event.target instanceof HTMLInputElement;
}

/**
 * The keyboard of the ARIA tree (S-162): `↑`/`↓`, `Home`/`End`, `→` opens or goes in, `←` closes or
 * goes to the folder above, typing finds a row by its name, `Shift` grows the selection and
 * `Ctrl`/`⌘` moves without it, `Space` selects — `Ctrl+Space` adds or takes out —, `Ctrl+A` selects
 * every row. `Enter` on a level that failed reads it again (the row's own key); `Enter` on an entry, `F2`, `Delete`
 * and the rest are commands, in the registry, so the palette shows their keys (S-201).
 *
 * @param goTo puts the keyboard on a row — and the DOM focus with it
 */
export function useTreeKeyboard(
  folder: string,
  tree: ExplorerTree,
  goTo: () => void,
): (event: KeyboardEvent) => void {
  const typed = useRef({ text: '', at: 0 });

  const move = useCallback(
    (index: number, event: KeyboardEvent) => {
      const store = explorerStore(folder).getState();
      const target = tree.rows[index];

      if (target === undefined) {
        return;
      }

      if (event.shiftKey && target.type === 'entry') {
        store.select(
          rangeOf(tree.rows, indexOfKey(tree.rows, store.anchor), index),
          target.key,
          store.anchor,
        );
      } else if (held(event) || target.type !== 'entry') {
        store.setFocused(target.key);
      } else {
        store.select([target.path], target.key);
      }

      goTo();
    },
    [folder, goTo, tree.rows],
  );

  return useCallback(
    (event: KeyboardEvent) => {
      if (fromField(event)) {
        return;
      }

      const store = explorerStore(folder).getState();
      const at = indexOfKey(tree.rows, store.focused);
      const moment: Moment = { rows: tree.rows, at, row: tree.rows[at] };
      const step = MOVES[event.key];

      if (step !== undefined) {
        event.preventDefault();
        move(step(moment), event);
        return;
      }

      if (handleOpening(event, moment, store, (index) => move(index, event))) {
        return;
      }

      if (handleSelection(event, moment, store)) {
        return;
      }

      if (isTyped(event)) {
        const now = Date.now();
        const text =
          now - typed.current.at > TYPE_AHEAD_MS ? event.key : typed.current.text + event.key;
        typed.current = { text, at: now };
        event.preventDefault();
        move(typeAhead(tree.rows, at, text), event);
      }
    },
    [folder, move, tree],
  );
}

type Store = ReturnType<ReturnType<typeof explorerStore>['getState']>;

/** `→` and `←`. Answers whether the key was one of them. */
function handleOpening(
  event: KeyboardEvent,
  moment: Moment,
  store: Store,
  move: (index: number) => void,
): boolean {
  const way = event.key === 'ArrowRight' ? right : event.key === 'ArrowLeft' ? left : null;

  if (way === null) {
    return false;
  }

  event.preventDefault();
  const index = way(moment, event.key === 'ArrowRight' ? store.expand : store.collapse);

  if (index !== null) {
    move(index);
  }

  return true;
}

/** Whether `Ctrl` — `⌘` on a Mac — is held. */
function held(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

/** `Space` selects the row; `Ctrl+Space` adds it to the selection, or takes it out. */
function toggled(selection: readonly string[], path: string, add: boolean): readonly string[] {
  if (!add) {
    return [path];
  }

  return selection.includes(path)
    ? selection.filter((each) => each !== path)
    : [...selection, path];
}

/** `Space`, `Ctrl+A` and `Esc`. Answers whether the key was one of them. */
function handleSelection(event: KeyboardEvent, moment: Moment, store: Store): boolean {
  const row = moment.row;

  if (event.key === ' ' && row?.type === 'entry') {
    event.preventDefault();
    store.select(toggled(store.selection, row.path, held(event)), row.key);
    return true;
  }

  if (event.key.toLowerCase() === 'a' && held(event)) {
    event.preventDefault();
    store.select(
      entryRows(moment.rows).map((each) => each.path),
      store.focused,
      store.anchor,
    );
    return true;
  }

  if (event.key === 'Escape' && row?.type === 'entry' && store.selection.length > 1) {
    store.select([row.path], row.key);
    return true;
  }

  return false;
}
