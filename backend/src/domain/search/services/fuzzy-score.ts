/**
 * A fuzzy match of one path against one query, and its evidence: the positions highlighted in
 * the client, and a score comparable to that of any other path for the same query.
 */
export interface FuzzyMatch {
  readonly score: number;
  /** Ascending indices into the full path string — never just the basename's. */
  readonly positions: readonly number[];
}

/** Where a character of a path begins a "word" — a camelCase boundary, or after one of these. */
const WORD_SEPARATOR = /[/\-_. ]/;

function isWordStart(path: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  const previous = path.charAt(index - 1);
  if (WORD_SEPARATOR.test(previous)) {
    return true;
  }
  const current = path.charAt(index);
  return /[A-Z]/.test(current) && /[a-z0-9]/.test(previous);
}

/**
 * The rightmost valid alignment of [query] as a subsequence of [path], matched case-insensitively.
 *
 * Rightmost rather than leftmost on purpose: a path's basename is its last segment, so leaning
 * right is what lets a query that spans a directory and the filename — `wbss` against
 * `web/src/.../SessionScreen.tsx` (S-39) — still land its tail inside the filename instead of the
 * first directory character the query happens to also match.
 *
 * @returns the positions, ascending, or `null` when [query] is not a subsequence at all
 */
function rightmostAlignment(lowerPath: string, lowerQuery: string): number[] | null {
  const positions = new Array<number>(lowerQuery.length);
  let bound = lowerPath.length;

  for (let index = lowerQuery.length - 1; index >= 0; index -= 1) {
    const found = lowerPath.lastIndexOf(lowerQuery.charAt(index), bound - 1);
    if (found === -1) {
      return null;
    }
    positions[index] = found;
    bound = found;
  }

  return positions;
}

/**
 * Scores [path] against [query] the way the locator ranks the folder's whole file list: a match
 * inside the basename outweighs any amount of contiguity or word-start bonus elsewhere, a
 * contiguous run outweighs any amount of word-start bonus, and a word-start match outweighs the
 * tiny penalty a longer path carries as the last, stable tiebreak (S-39). The gaps between the
 * four weights below are wide enough that no combination of the lesser three ever crosses a
 * difference of one in the one above it, for any path this product ever lists.
 *
 * @returns `null` when [query] is empty or is not a case-insensitive subsequence of [path]
 */
export function fuzzyScore(path: string, query: string): FuzzyMatch | null {
  if (query === '') {
    return null;
  }

  const positions = rightmostAlignment(path.toLowerCase(), query.toLowerCase());
  if (positions === null) {
    return null;
  }

  const basenameStart = path.lastIndexOf('/') + 1;
  let score = 0;

  for (const [index, position] of positions.entries()) {
    score += position >= basenameStart ? 1_000_000 : 1;
    if (index > 0 && positions[index - 1] === position - 1) {
      score += 1_000;
    }
    if (isWordStart(path, position)) {
      score += 100;
    }
  }
  score -= path.length * 0.001;

  return { score, positions };
}
