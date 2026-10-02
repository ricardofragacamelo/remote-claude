import type { LineEnding, TextPosition } from '../types/code-editor';
import type { Indentation } from '../types/editor';

/** The characters a line ending is. */
export const EOL_TEXT: Readonly<Record<LineEnding, string>> = { lf: '\n', crlf: '\r\n' };

/** A text with its lines ending one way — every `\r\n`, lone `\r` and `\n` made `eol`. */
export function withEol(text: string, eol: LineEnding): string {
  return text.replace(/\r\n|\r|\n/g, EOL_TEXT[eol]);
}

/**
 * Removes the spaces and tabs at the end of every line, and nothing else (S-237): the line endings,
 * the lines themselves and every other character stay as they are.
 */
export function trimTrailingWhitespace(text: string): string {
  return text.replace(/[ \t]+(?=\r?\n|$)/g, '');
}

/** Ends the text with one line ending when it does not end with one; an empty text stays empty. */
export function ensureFinalNewline(text: string, eol: LineEnding): string {
  return text === '' || /(\r\n|\n|\r)$/.test(text) ? text : text + EOL_TEXT[eol];
}

/** What saving does to a text, when the preferences ask for it (B-34). */
export interface SaveAdjustments {
  readonly trimTrailingWhitespace: boolean;
  readonly insertFinalNewline: boolean;
}

/** The text a save writes — only the adjustments that are on, applied to the text given. */
export function adjustForSave(text: string, eol: LineEnding, adjustments: SaveAdjustments): string {
  const trimmed = adjustments.trimTrailingWhitespace ? trimTrailingWhitespace(text) : text;
  return adjustments.insertFinalNewline ? ensureFinalNewline(trimmed, eol) : trimmed;
}

/**
 * The indentation a text uses, read from the lines that start with one: tabs when more lines start
 * with a tab, spaces otherwise — sized by the smallest step between two indented lines. `null` when
 * no line is indented: the preferences decide then.
 */
export function detectIndentation(text: string): Indentation | null {
  const leads = text
    .split(/\r?\n/)
    .map((line) => /^[ \t]+(?=\S)/.exec(line)?.[0])
    .filter((lead): lead is string => lead !== undefined);

  if (leads.length === 0) {
    return null;
  }

  const tabs = leads.filter((lead) => lead.startsWith('\t')).length;

  if (tabs * 2 > leads.length) {
    return { insertSpaces: false, size: 4 };
  }

  const widths = leads.filter((lead) => !lead.includes('\t')).map((lead) => lead.length);
  const size = Math.min(...widths.filter((width) => width > 0), 8);

  return { insertSpaces: true, size: [2, 4, 8].includes(size) ? size : 4 };
}

/**
 * Converts the indentation at the start of every line (S-251): to spaces, each tab becomes `size`
 * spaces; to tabs, each full run of `size` spaces becomes a tab, and what is left stays.
 */
export function convertIndentation(text: string, toSpaces: boolean, size: number): string {
  const spaces = ' '.repeat(size);

  return text.replace(/^[ \t]+/gm, (lead) => {
    const columns = [...lead].reduce(
      (width, character) => width + (character === '\t' ? size - (width % size) : 1),
      0,
    );

    return toSpaces
      ? spaces.repeat(Math.floor(columns / size)) + ' '.repeat(columns % size)
      : '\t'.repeat(Math.floor(columns / size)) + ' '.repeat(columns % size);
  });
}

/** The line and the column of an offset of a text whose lines end with `\n`. */
export function positionAt(text: string, offset: number): TextPosition {
  const before = text.slice(0, Math.max(0, offset)).split('\n');
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

/** The offset of a line and a column of a text whose lines end with `\n` — clamped into it. */
export function offsetAt(text: string, position: TextPosition): number {
  const lines = text.split('\n');
  const line = Math.min(Math.max(position.line, 1), lines.length);
  const before = lines.slice(0, line - 1).reduce((sum, each) => sum + each.length + 1, 0);
  const length = lines[line - 1]?.length ?? 0;

  return before + Math.min(Math.max(position.column, 1), length + 1) - 1;
}

/** A size in bytes, for a person, in their language — `1.5 MB`, `512 kB`, `3 byte`. */
export function formatBytes(bytes: number, locale: string): string {
  const units = [
    { unit: 'megabyte', size: 1_000_000 },
    { unit: 'kilobyte', size: 1_000 },
  ] as const;
  const fitting = units.find((each) => bytes >= each.size);

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: fitting?.unit ?? 'byte',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(fitting === undefined ? bytes : bytes / fitting.size);
}
