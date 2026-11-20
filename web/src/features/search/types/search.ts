/** What one locate query asks — Quick Open and the `@` of the composer share this shape. */
export interface LocateQuery {
  readonly query: string;
  readonly kinds: readonly ('file' | 'dir')[];
  /** Recent and open paths of the tab, pushed to the front without hiding a much better match. */
  readonly prefer?: readonly string[];
  readonly limit?: number;
  readonly includeIgnored?: boolean;
}

export type LocateEntryKind = 'file' | 'dir';

/** One path the locator found, with where the query matched it (for highlighting). */
export interface LocateEntry {
  readonly path: string;
  readonly kind: LocateEntryKind;
  readonly positions: readonly number[];
}

export type SearchTruncation = { readonly reason: 'limit' | 'timeout' } | null;

export interface LocateResult {
  readonly entries: readonly LocateEntry[];
  readonly truncated: SearchTruncation;
}

/** What a text search or a replace preview both ask — plan 11, B-10/B-11. */
export interface SearchQuery {
  readonly pattern: string;
  readonly isRegex: boolean;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly useIgnoreFiles: boolean;
  /** Only the tab's open editors — never a path outside them. */
  readonly onlyPaths?: readonly string[];
  readonly contextLines?: number;
}

export interface SearchMatch {
  readonly line: number;
  readonly column: number;
  readonly endColumn: number;
  readonly preview: string;
  readonly previewMatchStart: number;
  readonly previewMatchEnd: number;
}

export interface SearchContextLine {
  readonly line: number;
  readonly text: string;
}

/** One file's matches, accumulated as the NDJSON stream closes it (D-02) — never all at once. */
export interface SearchFileResult {
  readonly path: string;
  readonly matches: readonly SearchMatch[];
  readonly contextLines: readonly SearchContextLine[];
}

/** The text search, as the view reads it: still arriving, or settled, with what arrived kept either way. */
export interface TextSearchState {
  readonly files: readonly SearchFileResult[];
  readonly truncated: SearchTruncation;
  readonly skipped: number;
}

/** One replace-preview match — the same as a search match, plus its resolved replacement. */
export interface ReplacePreviewMatch extends SearchMatch {
  /** What `preview.slice(previewMatchStart, previewMatchEnd)` becomes — already case-resolved. */
  readonly replacement: string;
}

export interface ReplacePreviewFileResult {
  readonly path: string;
  readonly etag: string;
  readonly matches: readonly ReplacePreviewMatch[];
}

export interface ReplacePreviewState {
  readonly files: readonly ReplacePreviewFileResult[];
  readonly truncated: SearchTruncation;
  readonly skipped: number;
}

/** What `/search/replace` is asked, beyond the query itself. */
export interface ReplaceQuery extends SearchQuery {
  readonly replacement: string;
  readonly preserveCase: boolean;
}

export interface ReplaceApplyFileRequest {
  readonly path: string;
  readonly etag: string;
}

export type ReplaceApplySkipReason = 'binary' | 'tooLarge' | 'sensitive';

export interface ReplaceApplyReport {
  readonly applied: readonly string[];
  readonly changed: readonly string[];
  readonly missing: readonly string[];
  readonly skipped: readonly { readonly path: string; readonly reason: ReplaceApplySkipReason }[];
}
