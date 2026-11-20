import { baseQueryOf } from './query-fields';
import type { QueryFields } from './query-fields';
import type { SearchFileResult, SearchQuery } from '../types/search';

/** The query and every toggle a `.code-search` file's header names (plan 11, B-17). */
export interface CodeSearchHeader extends QueryFields {
  readonly contextLines: number;
}

/** One buffer line (1-based) a `.code-search` file's body names — a click or F12 opens it. */
export interface CodeSearchResult {
  readonly path: string;
  readonly line: number;
}

export interface CodeSearchDocument {
  readonly header: CodeSearchHeader;

  /** Every result line, by the buffer's own line number — what a click or F12 reads (S-17x). */
  readonly results: ReadonlyMap<number, CodeSearchResult>;
}

type FlagName = 'regex' | 'caseSensitive' | 'wholeWord';

function flagsOf(header: CodeSearchHeader): readonly FlagName[] {
  const flags: FlagName[] = [];
  if (header.isRegex) flags.push('regex');
  if (header.caseSensitive) flags.push('caseSensitive');
  if (header.wholeWord) flags.push('wholeWord');
  return flags;
}

/** `file`'s own matches and context lines, merged by line number — a match's own text wins. */
function rowsOf(
  file: SearchFileResult,
): readonly { readonly line: number; readonly text: string }[] {
  const byLine = new Map<number, string>();
  for (const context of file.contextLines) {
    byLine.set(context.line, context.text);
  }
  for (const match of file.matches) {
    byLine.set(match.line, match.preview);
  }
  return [...byLine.entries()]
    .sort(([left], [right]) => left - right)
    .map(([line, text]) => ({ line, text }));
}

/**
 * `files`, as a `.code-search` file's own text (plan 11, B-17) — the header first, then one
 * group per file, a blank line between every section. Reopening it, or saving it, round-trips
 * through {@link parseCodeSearch} exactly.
 */
export function serializeCodeSearch(
  header: CodeSearchHeader,
  files: readonly SearchFileResult[],
): string {
  const head = [
    `# Query: ${header.query}`,
    `# Flags: ${flagsOf(header).join(', ')}`,
    `# Include: ${header.include}`,
    `# Exclude: ${header.exclude}`,
    `# UseIgnoreFiles: ${String(header.useIgnoreFiles)}`,
    `# ContextLines: ${String(header.contextLines)}`,
  ];

  const groups = files.map(
    (file) =>
      `${file.path}:\n${rowsOf(file)
        .map((row) => `  ${String(row.line)}: ${row.text}`)
        .join('\n')}`,
  );

  return [...head, '', ...groups].join('\n');
}

const HEADER_LINE = /^# (\w+): (.*)$/;
const FILE_LINE = /^(\S.*):$/;
const RESULT_LINE = /^ {2}(\d+): /;

/** A header field, parsed back to its own type — unknown fields and malformed lines are dropped. */
function applyHeaderField(header: Partial<CodeSearchHeader>, name: string, value: string): void {
  if (name === 'Query') {
    (header as { query: string }).query = value;
  } else if (name === 'Flags') {
    const flags = new Set(value.split(',').map((flag) => flag.trim()));
    (header as { isRegex: boolean }).isRegex = flags.has('regex');
    (header as { caseSensitive: boolean }).caseSensitive = flags.has('caseSensitive');
    (header as { wholeWord: boolean }).wholeWord = flags.has('wholeWord');
  } else if (name === 'Include') {
    (header as { include: string }).include = value;
  } else if (name === 'Exclude') {
    (header as { exclude: string }).exclude = value;
  } else if (name === 'UseIgnoreFiles') {
    (header as { useIgnoreFiles: boolean }).useIgnoreFiles = value === 'true';
  } else if (name === 'ContextLines') {
    (header as { contextLines: number }).contextLines = Number.parseInt(value, 10) || 0;
  }
}

/** The default header a malformed, or a missing, field falls back to — never throws. */
function emptyHeader(): CodeSearchHeader {
  return {
    query: '',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: '',
    useIgnoreFiles: true,
    contextLines: 0,
  };
}

/** A body line's own effect: a result row added, a new file group opened, or group closed. */
function applyBodyLine(
  results: Map<number, CodeSearchResult>,
  path: string | null,
  bufferLine: number,
  line: string,
): string | null {
  const resultMatch = RESULT_LINE.exec(line);
  if (resultMatch?.[1] !== undefined && path !== null) {
    results.set(bufferLine, { path, line: Number.parseInt(resultMatch[1], 10) });
    return path;
  }

  const fileMatch = FILE_LINE.exec(line);
  if (fileMatch?.[1] !== undefined) {
    return fileMatch[1];
  }

  return line === '' ? null : path;
}

/**
 * A `.code-search` file's own text, read back (plan 11, B-17) — a line the format does not
 * recognize is skipped, never thrown on: the buffer is a person's to edit freely, and a typo
 * degrades the header or drops one result, never the whole file.
 */
export function parseCodeSearch(text: string): CodeSearchDocument {
  const header = emptyHeader();
  const results = new Map<number, CodeSearchResult>();
  let path: string | null = null;

  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    const headerMatch = HEADER_LINE.exec(line);
    if (headerMatch?.[1] !== undefined && headerMatch[2] !== undefined) {
      applyHeaderField(header, headerMatch[1], headerMatch[2]);
      continue;
    }

    path = applyBodyLine(results, path, index + 1, line);
  }

  return { header, results };
}

/** The extension every search editor tab is saved and reopened as (plan 11, B-17, D-08). */
export const CODE_SEARCH_EXTENSION = '.code-search';

/** Whether `path` is one of the search editor's own files. */
export function isCodeSearchFile(path: string): boolean {
  return path.endsWith(CODE_SEARCH_EXTENSION);
}

const CONTEXT_LINES_LINE = /^# ContextLines: \d+$/m;

/**
 * `text`'s own `# ContextLines:` line, set to `n` — every other line, header or body, is kept as
 * it is: adjusting the spinner (S-132) never touches a result the person may be reading.
 */
export function withContextLines(text: string, n: number): string {
  return CONTEXT_LINES_LINE.test(text)
    ? text.replace(CONTEXT_LINES_LINE, `# ContextLines: ${String(n)}`)
    : text;
}

/** `header`, as the request "run again" (S-132) asks the text search with. */
export function searchQueryOf(header: CodeSearchHeader): SearchQuery {
  return { ...baseQueryOf(header), contextLines: header.contextLines };
}
