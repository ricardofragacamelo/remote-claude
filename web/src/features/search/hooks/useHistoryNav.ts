import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

import { focusEditor } from '@/features/editor';
import { searchViewStore } from '../store/search-view.store';

export interface HistoryNav {
  onKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
}

/**
 * Up/down walk this folder's own search history (plan 11, B-18, S-136), the way a shell's own
 * does: the first `ArrowUp` keeps what was being typed, so `ArrowDown` back past the oldest entry
 * it showed returns to it — the person's own, unfinished, draft, never thrown away. `Enter` commits
 * the query actually run, pushing it to the front, and leaves the history at that. `Escape` gives
 * the focus back to the editor (plan 11, B-20, S-146) — the query field's own, same as a dialog's.
 */
export function useHistoryNav(
  folder: string,
  value: string,
  onChange: (value: string) => void,
): HistoryNav {
  const draft = useRef(value);
  const index = useRef<number | null>(null);

  function goUp(history: readonly string[]): void {
    if (history.length === 0) {
      return;
    }

    if (index.current === null) {
      draft.current = value;
      index.current = 0;
    } else if (index.current < history.length - 1) {
      index.current += 1;
    }

    onChange(history[index.current] ?? '');
  }

  function goDown(history: readonly string[]): void {
    if (index.current === null) {
      return;
    }

    if (index.current === 0) {
      index.current = null;
      onChange(draft.current);
      return;
    }

    index.current -= 1;
    onChange(history[index.current] ?? '');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      focusEditor(folder);
      return;
    }

    const store = searchViewStore(folder).getState();

    if (event.key === 'Enter') {
      store.pushHistory(value);
      index.current = null;
      return;
    }

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      index.current = null;
      return;
    }

    event.preventDefault();

    if (event.key === 'ArrowUp') {
      goUp(store.history);
    } else {
      goDown(store.history);
    }
  }

  return { onKeyDown };
}
