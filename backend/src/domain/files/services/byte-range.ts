/**
 * What a `Range` header asks of a file of `size` bytes, as RFC 9110 reads it — plan 07, B-48.
 *
 * - `whole` — no header, a unit other than `bytes`, a header that does not parse, or **more than
 *   one** range: the RFC lets a server ignore a `Range` it will not serve, and answering several
 *   ranges would be `multipart/byteranges`, which no client of ours reads. The body is the file;
 * - `part` — one range, its `end` cut to the last byte, both inclusive: a `206`;
 * - `unsatisfiable` — a range that starts past the end, or a suffix of nothing: a `416`.
 *
 * Pure: the header and the size in, the answer out. The hexadecimal view and the paginated read
 * page through a file with it (07 · B-51).
 */
export type ByteRangeRequest =
  | { readonly kind: 'whole' }
  | { readonly kind: 'part'; readonly start: number; readonly end: number }
  | { readonly kind: 'unsatisfiable' };

/** `bytes=<first>-<last>`, `bytes=<first>-` or `bytes=-<suffix>` — one of them, nothing else. */
const ONE_RANGE = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i;

const WHOLE: ByteRangeRequest = { kind: 'whole' };
const UNSATISFIABLE: ByteRangeRequest = { kind: 'unsatisfiable' };

/**
 * @param header the `Range` the request carried, or `null`
 * @param size the size of the file now, from the descriptor that will be read
 */
export function rangeOf(header: string | null, size: number): ByteRangeRequest {
  const match = header === null ? null : ONE_RANGE.exec(header.trim());

  if (match === null) {
    return WHOLE;
  }

  const [, first = '', last = ''] = match;

  if (first === '') {
    return last === '' ? WHOLE : suffixOf(Number(last), size);
  }

  return fromStart(Number(first), last === '' ? null : Number(last), size);
}

/** The last `length` bytes. A suffix of nothing, or of an empty file, is nothing to send. */
function suffixOf(length: number, size: number): ByteRangeRequest {
  if (length === 0 || size === 0) {
    return UNSATISFIABLE;
  }

  return { kind: 'part', start: Math.max(0, size - length), end: size - 1 };
}

/** From `start` to `last`, or to the end. A `last` before `start` is a header that means nothing. */
function fromStart(start: number, last: number | null, size: number): ByteRangeRequest {
  if (last !== null && last < start) {
    return WHOLE;
  }

  if (start >= size) {
    return UNSATISFIABLE;
  }

  return { kind: 'part', start, end: Math.min(last ?? size - 1, size - 1) };
}
