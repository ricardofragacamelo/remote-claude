import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { occurrencesIn } from '../lib/conversation-search';
import type { StreamMessage } from '../types/live-session';

/** The search of a conversation: what is asked, where it is, and the way to move. */
export interface ConversationSearch {
  /** `null` while the search is closed. */
  readonly query: string | null;

  /** The message of every occurrence, in order. */
  readonly found: readonly string[];

  /** Which occurrence is the current one, from 0. */
  readonly at: number;
  close(): void;
  setQuery(query: string): void;

  /** To the next occurrence (`1`) or the previous one (`-1`), round. */
  go(step: number): void;
}

/**
 * Searching what is loaded of a conversation — opened by `Ctrl/Cmd+F` **with the focus in it**, so
 * the page's own search stays the browser's everywhere else (plan 08, B-24). Moving to an occurrence
 * brings its message into view.
 */
export function useConversationSearch(
  messages: readonly StreamMessage[],
  container: RefObject<HTMLElement | null>,
): ConversationSearch {
  const [query, setQueryState] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const found = query === null ? [] : occurrencesIn(messages, query);
  const at = found.length === 0 ? 0 : Math.min(index, found.length - 1);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const inside =
        event.target instanceof Node && container.current?.contains(event.target) === true;

      if (inside && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setQueryState((current) => current ?? '');
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [container]);

  return {
    query,
    found,
    at,
    close: () => {
      setQueryState(null);
    },
    setQuery: (next) => {
      setQueryState(next);
      setIndex(0);
    },
    go: (step) => {
      const next = (at + step + found.length) % Math.max(1, found.length);
      setIndex(next);
      container.current
        ?.querySelector(`[data-message-id="${CSS.escape(found[next] ?? '')}"]`)
        ?.scrollIntoView({ block: 'center' });
    },
  };
}
