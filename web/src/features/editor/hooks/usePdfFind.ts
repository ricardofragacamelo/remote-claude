import { useCallback, useState } from 'react';

import { countOf } from '../lib/pdf-find';
import type { FindCount } from '../lib/pdf-find';
import type { PdfFindResult, PdfView } from '../types/pdf';

/** The search of a reader, as its bar draws it (21 · B-14). */
export interface PdfFind {
  readonly open: boolean;

  /** How many times it was shown — each time takes the focus to its field again. */
  readonly shown: number;
  readonly query: string;
  readonly caseSensitive: boolean;
  readonly entireWord: boolean;
  readonly count: FindCount;

  /** Opens the bar — the last search with it, highlighted again (S-47). */
  show(): void;

  /** Closes the bar and takes the highlight away; the search is kept for the next time. */
  close(): void;
  setQuery(query: string): void;
  next(): void;
  previous(): void;
  toggleCase(): void;
  toggleWord(): void;
}

/** What is searched: the text and its two options. */
interface Search {
  readonly query: string;
  readonly caseSensitive: boolean;
  readonly entireWord: boolean;
}

/**
 * The search of a reader over its view: each change of the text or of an option is a new search,
 * Enter is the same one again, and an empty field takes the highlight away (S-45). What it found
 * arrives through the view; `searchedFor` says what a result has to answer to be kept (S-48).
 */
export function usePdfFind(
  view: PdfView | null,
  searchedFor: (query: string) => void,
  found: PdfFindResult | null,
): PdfFind {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(0);
  const [search, setSearch] = useState<Search>({
    query: '',
    caseSensitive: false,
    entireWord: false,
  });

  const run = useCallback(
    (next: Search, again: boolean, previous: boolean) => {
      searchedFor(next.query);
      if (next.query === '') {
        view?.closeFind();
      } else {
        view?.find({ ...next, again, previous });
      }
    },
    [view, searchedFor],
  );

  const change = (next: Search): void => {
    setSearch(next);
    run(next, false, false);
  };

  return {
    open,
    shown,
    ...search,
    count: countOf(search.query, found),
    show: () => {
      setOpen(true);
      setShown((count) => count + 1);
      if (!open && search.query !== '') run(search, false, false);
    },
    close: () => {
      setOpen(false);
      searchedFor('');
      view?.closeFind();
    },
    setQuery: (query) => {
      change({ ...search, query });
    },
    next: () => {
      run(search, true, false);
    },
    previous: () => {
      run(search, true, true);
    },
    toggleCase: () => {
      change({ ...search, caseSensitive: !search.caseSensitive });
    },
    toggleWord: () => {
      change({ ...search, entireWord: !search.entireWord });
    },
  };
}
