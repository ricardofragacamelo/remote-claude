import { preserveCase } from './preserve-case';
import { resolvedReplacementOf } from './replacement-text';
import { utf16ColumnOf } from './byte-utf16-column';

/** The one line's worth of match data `appliedLineOf` needs — a subset of `EngineLineMatch`. */
export interface AppliedLineMatch {
  readonly lineNumber: number;
  readonly submatches: readonly {
    readonly startByte: number;
    readonly endByte: number;
    readonly text: string;
  }[];
}

/**
 * One line, every submatch on it replaced — back to front, so an earlier splice never shifts an
 * offset still to be used (B-11).
 */
export function appliedLineOf(
  lineText: string,
  submatches: AppliedLineMatch['submatches'],
  replacement: string,
  preserve: boolean,
): string {
  const lineBytes = Buffer.from(lineText, 'utf8');
  let result = lineText;

  for (const submatch of [...submatches].reverse()) {
    const start = utf16ColumnOf(lineBytes, submatch.startByte);
    const end = utf16ColumnOf(lineBytes, submatch.endByte);
    const resolved = resolvedReplacementOf(replacement, submatch.text);
    const finalText = preserve ? preserveCase(submatch.text, resolved) : resolved;
    result = result.slice(0, start) + finalText + result.slice(end);
  }

  return result;
}

/**
 * A whole file's content, with every matched line replaced — the other lines untouched, byte for
 * byte. Split and rejoined on `\n` alone, never `\r\n`: ripgrep's own `line_number` and `lineText`
 * already keep a CRLF file's `\r` as the last character of the line (measured), the same split
 * `content` itself falls into, so the two always line up (S-90).
 */
export function appliedContentOf(
  content: string,
  matchedLines: readonly AppliedLineMatch[],
  replacement: string,
  preserve: boolean,
): string {
  const byLineNumber = new Map(matchedLines.map((line) => [line.lineNumber, line]));
  const lines = content.split('\n');

  return lines
    .map((lineText, index) => {
      const match = byLineNumber.get(index + 1);
      return match === undefined
        ? lineText
        : appliedLineOf(lineText, match.submatches, replacement, preserve);
    })
    .join('\n');
}
