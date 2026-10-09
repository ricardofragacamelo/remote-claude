import type { PdfFindResult } from '../types/pdf';

/** What the search bar shows of a search: the match on screen and how many — or nothing yet. */
export type FindCount =
  | { readonly kind: 'none' }
  | { readonly kind: 'searching' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'found'; readonly current: number; readonly total: number };

/**
 * The result to keep: one that answers the search on screen replaces the last, and one that answers
 * a search already replaced — typed fast, the old count arriving late — is dropped (S-48).
 */
export function keptResult(
  searched: string,
  kept: PdfFindResult | null,
  arrived: PdfFindResult,
): PdfFindResult | null {
  return arrived.query === searched ? arrived : kept;
}

/**
 * What the bar says of the search `searched`: nothing for no text, "no results" once the pages were
 * read and nothing matched — a PDF with no text says that too (S-45, S-49) —, else "n of m".
 */
export function countOf(searched: string, result: PdfFindResult | null): FindCount {
  if (searched === '') return { kind: 'none' };
  if (result === null || result.query !== searched) return { kind: 'searching' };
  if (result.total > 0) return { kind: 'found', current: result.current, total: result.total };
  return result.pending ? { kind: 'searching' } : { kind: 'empty' };
}
