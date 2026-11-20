import { offsetAt, withEol } from '@/features/editor';
import type { ReplacePreviewMatch } from '../types/search';

/**
 * `content`, every match of it replaced with its own resolved text (B-16) — for the **preview**
 * of a diff, never the real apply: the backend (`appliedContentOf`) is the one that writes, over
 * the disk's own current content, re-matched fresh. Split and rejoined on `\n` alone, the same
 * reasoning the backend's own version documents (S-90) — `\r` stays the last character of a CRLF
 * line either way.
 *
 * Offsets are all read against `content` itself, never the text built up so far: a match earlier
 * in the file never shifts where a later one is found, in whatever order the matches arrive.
 */
export function appliedPreviewContent(
  content: string,
  matches: readonly ReplacePreviewMatch[],
): string {
  const text = withEol(content, 'lf');
  const ordered = [...matches].sort(
    (left, right) => left.line - right.line || left.column - right.column,
  );

  let result = '';
  let cursor = 0;

  for (const match of ordered) {
    const start = offsetAt(text, { line: match.line, column: match.column });
    const end = offsetAt(text, { line: match.line, column: match.endColumn });

    result += text.slice(cursor, start) + match.replacement;
    cursor = end;
  }

  return result + text.slice(cursor);
}
