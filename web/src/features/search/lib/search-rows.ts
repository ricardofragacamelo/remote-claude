import { isDismissed } from '../store/search-view.store';
import type { SearchMatch } from '../types/search';

/** One row of the results tree — a file, with its live match count, or one of its matches. */
export type SearchRow<M extends SearchMatch = SearchMatch> =
  | {
      readonly key: string;
      readonly kind: 'file';
      readonly path: string;
      readonly matchCount: number;
      readonly collapsed: boolean;
      readonly stale: boolean;
    }
  | {
      readonly key: string;
      readonly kind: 'match';
      readonly path: string;
      readonly match: M;
    };

/** A file's own matches — a text search's own, or a replace preview's (B-16), which also carries one. */
export interface MatchedFile<M extends SearchMatch> {
  readonly path: string;
  readonly matches: readonly M[];
}

/** The key one match's own row is found by — a file dismisses by its own `path` instead. */
export function matchRowKey(path: string, match: Pick<SearchMatch, 'line' | 'column'>): string {
  return `${path}\u0000${String(match.line)}:${String(match.column)}`;
}

/**
 * `files` flattened into rows for the virtualized tree (B-15) — a dismissed file never shows, a
 * dismissed match is left out of its file's count and list, and a file left with no match once
 * dismissal is applied shows nothing at all. A collapsed file hides its matches, never its own row.
 *
 * Generic over the match shape so the replace preview's tree (B-16), whose match also carries the
 * resolved replacement, reads the same flattening — never a second copy of it.
 */
export function searchRowsOf<M extends SearchMatch>(
  files: readonly MatchedFile<M>[],
  collapsed: ReadonlySet<string>,
  dismissed: ReadonlySet<string>,
  stale: ReadonlySet<string>,
): readonly SearchRow<M>[] {
  const rows: SearchRow<M>[] = [];

  for (const file of files) {
    if (isDismissed(dismissed, file.path)) {
      continue;
    }

    const matches = file.matches.filter(
      (match) => !isDismissed(dismissed, file.path, match.line, match.column),
    );

    if (matches.length === 0) {
      continue;
    }

    const isCollapsed = collapsed.has(file.path);
    rows.push({
      key: file.path,
      kind: 'file',
      path: file.path,
      matchCount: matches.length,
      collapsed: isCollapsed,
      stale: stale.has(file.path),
    });

    if (!isCollapsed) {
      for (const match of matches) {
        rows.push({ key: matchRowKey(file.path, match), kind: 'match', path: file.path, match });
      }
    }
  }

  return rows;
}

/** How many matches `rows` has, a dismissed or collapsed one excluded — only a file row counts. */
export function resultCountOf<M extends SearchMatch>(rows: readonly SearchRow<M>[]): number {
  return rows.reduce((total, row) => (row.kind === 'file' ? total + row.matchCount : total), 0);
}

/**
 * `rows`, as the editor people's own "Copy All" writes it: each file's path, then one line per
 * match — a collapsed file's matches still copy, since collapsing is only ever a question of what
 * is drawn.
 */
export function copyAllTextOf(rows: readonly SearchRow[]): string {
  const lines: string[] = [];

  for (const row of rows) {
    if (row.kind === 'file') {
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(row.path);
    } else {
      lines.push(`  ${String(row.match.line)}: ${row.match.preview}`);
    }
  }

  return lines.join('\n');
}
