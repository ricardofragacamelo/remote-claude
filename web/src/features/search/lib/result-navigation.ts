import type { SearchMatch } from '../types/search';
import type { SearchRow } from './search-rows';

/** One of `rows`'s own match rows — never a file row, which `F4`/`Shift+F4` skip over. */
type MatchRow<M extends SearchMatch> = Extract<SearchRow<M>, { kind: 'match' }>;

function matchRowsOf<M extends SearchMatch>(rows: readonly SearchRow<M>[]): readonly MatchRow<M>[] {
  return rows.filter((row): row is MatchRow<M> => row.kind === 'match');
}

/**
 * The match row `F4` (`direction` 1) or `Shift+F4` (`direction` -1) moves to from `activeKey`, among
 * `rows`'s own matches, in tree order — wrapping past either end (plan 11, B-19, S-141). `null`
 * with no match at all; with `activeKey` gone from `rows` (dismissed, collapsed, a fresh search),
 * the first (`F4`) or last (`Shift+F4`).
 */
export function stepResult<M extends SearchMatch>(
  rows: readonly SearchRow<M>[],
  activeKey: string | null,
  direction: 1 | -1,
): MatchRow<M> | null {
  const matches = matchRowsOf(rows);
  if (matches.length === 0) {
    return null;
  }

  const at = matches.findIndex((row) => row.key === activeKey);
  const next =
    at === -1
      ? direction === 1
        ? 0
        : matches.length - 1
      : (((at + direction) % matches.length) + matches.length) % matches.length;

  // `next` is always a valid index into `matches` — one of the two branches above, or a modulo
  // of `matches.length`, which is itself `> 0` here (the empty case already returned above).
  return matches[next]!;
}
