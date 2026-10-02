import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useStore } from 'zustand';

import { indexOfKey, isFocusable } from '../lib/tree-navigation';
import type { TreeRow } from '../lib/tree-rows';
import { explorerStore } from '../store/explorer.store';

/** The row the keyboard lands on when its own is gone: the one now in its place, or the one above. */
export function neighbourOf(rows: readonly TreeRow[], formerIndex: number): number {
  for (let index = Math.min(formerIndex, rows.length - 1); index >= 0; index -= 1) {
    const row = rows[index];

    if (row !== undefined && isFocusable(row)) {
      return index;
    }
  }

  return rows.findIndex(isFocusable);
}

/** The element of a row, by its key. */
function elementOf(tree: HTMLElement | null, key: string): HTMLElement | null {
  return (
    [...(tree?.querySelectorAll<HTMLElement>('[data-key]') ?? [])].find(
      (element) => element.dataset['key'] === key,
    ) ?? null
  );
}

/**
 * Keeps the DOM focus on the row the keyboard is on, through a virtualized window: the row is
 * always drawn, and focused — which scrolls it into view. When it disappears — deleted on disk, by Claude or by
 * anyone — the keyboard goes to its neighbour, selected, and the focus stays in the tree (S-189).
 * A request of the store — a reveal, a name just given — brings the focus back too.
 *
 * @returns the way to ask for the DOM focus on the row the store puts the keyboard on next
 */
export function useFollowFocus(
  folder: string,
  rows: readonly TreeRow[],
  tree: RefObject<HTMLElement | null>,
): () => void {
  const store = explorerStore(folder);
  const focused = useStore(store, (state) => state.focused);
  const focusRequest = useStore(store, (state) => state.focusRequest);
  const wanted = useRef(false);
  const previous = useRef<{ rows: readonly TreeRow[]; focused: string | null }>({
    rows,
    focused,
  });

  const goTo = useCallback(() => {
    wanted.current = true;
  }, []);

  // A focused row that left the rows: its neighbour takes its place — the selection with it.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { rows, focused };

    if (focused === null || indexOfKey(rows, focused) !== -1 || before.focused !== focused) {
      return;
    }

    const formerIndex = indexOfKey(before.rows, focused);

    // A row not on screen yet — revealed, made a moment ago — is waited for, not replaced.
    if (formerIndex === -1) {
      return;
    }

    const next = rows[neighbourOf(rows, formerIndex)];
    const state = store.getState();
    const hadFocus = tree.current?.contains(document.activeElement) === true;

    if (next === undefined) {
      state.select([], null);
      return;
    }

    state.select(next.type === 'entry' ? [next.path] : [], next.key);
    wanted.current = hadFocus || document.activeElement === document.body;
  }, [focused, rows, store, tree]);

  // A request of the store — a reveal, a name just given — asks for the focus; the rows changing
  // under it do not.
  useEffect(() => {
    if (focusRequest > 0) {
      wanted.current = true;
    }
  }, [focusRequest]);

  useEffect(() => {
    // Nowhere yet: the tab stop is the first row, and that is where the focus goes.
    const key = focused ?? rows.find(isFocusable)?.key;

    if (!wanted.current || key === undefined) {
      return;
    }

    const element = elementOf(tree.current, key);

    if (element !== null) {
      wanted.current = false;
      // Not `preventScroll`: the browser bringing the row into view is what moves the window.
      element.focus();
    }
  });

  return goTo;
}
