/**
 * Reads one line of `rg --json`'s own NDJSON protocol — never trusted further than its shape:
 * a field missing or of the wrong type makes the line `unknown`, dropped rather than guessed at.
 *
 * A path that is not valid UTF-8 arrives as `{ "bytes": "<base64>" }` instead of `{ "text": … }`
 * (measured); such a path is treated the same as any other malformed line here — unknown, and
 * skipped. ripgrep's `lines.text` always carries one trailing `\n` for a single-line match
 * (measured); stripped once here, so neither the UTF-16 column nor the preview window is ever
 * off by one because of it.
 */

export interface RipgrepSubmatch {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface RipgrepMatchData {
  readonly path: string;
  readonly lineNumber: number;
  readonly lineText: string;
  readonly submatches: readonly RipgrepSubmatch[];
}

export interface RipgrepContextData {
  readonly path: string;
  readonly lineNumber: number;
  readonly lineText: string;
}

export type RipgrepMessage =
  | { readonly type: 'begin'; readonly path: string }
  | { readonly type: 'match'; readonly data: RipgrepMatchData }
  | { readonly type: 'context'; readonly data: RipgrepContextData }
  | { readonly type: 'end'; readonly path: string; readonly binaryOffset: number | null }
  | { readonly type: 'summary' }
  | { readonly type: 'unknown' };

const UNKNOWN: RipgrepMessage = { type: 'unknown' };

/**
 * `./` is stripped once, here: an explicit `.` path argument (never omitted — see
 * `search-text-argv.ts` for why) makes ripgrep prefix every result with it.
 */
function pathTextOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const text = (value as Record<string, unknown>)['text'];
  if (typeof text !== 'string') {
    return null;
  }
  return text.startsWith('./') ? text.slice(2) : text;
}

function withoutTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

function beginMessage(data: Record<string, unknown> | undefined): RipgrepMessage {
  const path = data === undefined ? null : pathTextOf(data['path']);
  return path === null ? UNKNOWN : { type: 'begin', path };
}

/** `binary_offset` is a number once ripgrep detects binary content in the file, `null` otherwise. */
function endMessage(data: Record<string, unknown> | undefined): RipgrepMessage {
  const path = data === undefined ? null : pathTextOf(data['path']);
  if (path === null) {
    return UNKNOWN;
  }
  const binaryOffset = data?.['binary_offset'];
  return {
    type: 'end',
    path,
    binaryOffset: typeof binaryOffset === 'number' ? binaryOffset : null,
  };
}

function submatchesOf(raw: unknown): readonly RipgrepSubmatch[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const submatches: RipgrepSubmatch[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    const start = record['start'];
    const end = record['end'];
    const match = record['match'];
    const text =
      typeof match === 'object' && match !== null
        ? (match as Record<string, unknown>)['text']
        : null;
    if (typeof start !== 'number' || typeof end !== 'number' || typeof text !== 'string') {
      return null;
    }
    submatches.push({ start, end, text });
  }
  return submatches;
}

/** `lines.text` of a `match` or a `context` message — the one field both share, byte for byte. */
function lineTextOf(lines: unknown): string | null {
  if (typeof lines !== 'object' || lines === null) {
    return null;
  }
  const text = (lines as Record<string, unknown>)['text'];
  return typeof text === 'string' ? text : null;
}

/** What `matchMessage` and `contextMessage` both parse before adding their own field. */
interface LineMessageBase {
  readonly path: string;
  readonly lineNumber: number;
  readonly lineText: string;
}

function lineMessageBaseOf(data: Record<string, unknown> | undefined): LineMessageBase | null {
  if (data === undefined) {
    return null;
  }
  const path = pathTextOf(data['path']);
  const lineText = lineTextOf(data['lines']);
  const lineNumber = data['line_number'];

  return path === null || lineText === null || typeof lineNumber !== 'number'
    ? null
    : { path, lineNumber, lineText: withoutTrailingNewline(lineText) };
}

function matchMessage(data: Record<string, unknown> | undefined): RipgrepMessage {
  const base = lineMessageBaseOf(data);
  const submatches = data === undefined ? null : submatchesOf(data['submatches']);

  if (base === null || submatches === null) {
    return UNKNOWN;
  }

  return { type: 'match', data: { ...base, submatches } };
}

function contextMessage(data: Record<string, unknown> | undefined): RipgrepMessage {
  const base = lineMessageBaseOf(data);

  return base === null ? UNKNOWN : { type: 'context', data: base };
}

/** @returns `{ type: 'unknown' }` for anything not valid JSON, or not one of ripgrep's own shapes */
export function parseRipgrepLine(line: string): RipgrepMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return UNKNOWN;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return UNKNOWN;
  }

  const message = parsed as Record<string, unknown>;
  const data = message['data'] as Record<string, unknown> | undefined;

  switch (message['type']) {
    case 'begin':
      return beginMessage(data);
    case 'end':
      return endMessage(data);
    case 'match':
      return matchMessage(data);
    case 'context':
      return contextMessage(data);
    case 'summary':
      return { type: 'summary' };
    default:
      return UNKNOWN;
  }
}
