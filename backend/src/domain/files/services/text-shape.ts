/**
 * What can be told about a file's bytes without decoding them in any particular encoding.
 *
 * The rules of [07 · D-04](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-04--teto-de-tamanho-e-encoding):
 * only what is **certain** is detected — a byte-order mark, and valid UTF-8. Anything else is the
 * person's to choose ("reopen with encoding"); a guess here is a save that rewrites every accented
 * byte later.
 */

/** How many leading bytes are looked at for a NUL — the heuristic of git and of VS Code. */
export const BINARY_PROBE_BYTES = 8 * 1024;

/** The encodings a byte-order mark identifies. */
export type MarkedEncoding = 'utf8' | 'utf16le' | 'utf16be';

/** The end-of-line convention of a text: one of the two, or both. */
export type EndOfLine = 'lf' | 'crlf' | 'mixed';

/** The byte-order marks this server knows, longest first so UTF-8's three bytes are tried first. */
const MARKS: readonly { readonly encoding: MarkedEncoding; readonly bytes: readonly number[] }[] = [
  { encoding: 'utf8', bytes: [0xef, 0xbb, 0xbf] },
  { encoding: 'utf16le', bytes: [0xff, 0xfe] },
  { encoding: 'utf16be', bytes: [0xfe, 0xff] },
];

/** The byte-order mark of each encoding that has one, as it is written back on a save. */
export function markOf(encoding: MarkedEncoding): Uint8Array {
  return Uint8Array.from(MARKS.find((mark) => mark.encoding === encoding)?.bytes ?? []);
}

/** The encoding a byte-order mark at the start names, and how long the mark is; `null` without one. */
export function byteOrderMarkOf(
  bytes: Uint8Array,
): { readonly encoding: MarkedEncoding; readonly length: number } | null {
  const mark = MARKS.find((candidate) =>
    candidate.bytes.every((byte, index) => bytes[index] === byte),
  );

  return mark === undefined ? null : { encoding: mark.encoding, length: mark.bytes.length };
}

/** A NUL in the first {@link BINARY_PROBE_BYTES} — and only there: one further on is text (S-45). */
export function looksBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, BINARY_PROBE_BYTES).includes(0);
}

/** Whether the bytes are UTF-8 a strict decoder accepts. */
export function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * How a text ends its lines. A text with no line break at all reads as `lf`, the convention of the
 * machine this runs on; the server never rewrites either (S-72).
 */
export function endOfLineOf(text: string): EndOfLine {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;

  if (crlf > 0 && lf > 0) {
    return 'mixed';
  }

  return crlf > 0 ? 'crlf' : 'lf';
}
