import { isUtf8, looksBinary } from './text-shape';

/**
 * What a file's bytes are, said by the bytes — never by the extension — plan 07, B-48.
 *
 * Content of the user's served from the origin of the product is script on that origin if it is
 * served as a document ([07 · D-18](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)).
 * So the type is read from a signature in the first bytes, and the answer is one of a short list,
 * **never** `text/html`: an `.html` is text, and its preview is its source. A `.png` that is really
 * a page is not a PNG, and goes out as `application/octet-stream`.
 */

export const OCTET_STREAM = 'application/octet-stream';
export const PLAIN_TEXT = 'text/plain; charset=utf-8';
export const SVG = 'image/svg+xml';

/** Bytes expected at an offset: as numbers, or as the ASCII letters they spell. */
interface Mark {
  readonly at: number;
  readonly bytes: readonly number[] | string;
}

/** One type, and every mark its files start with. */
interface Signature {
  readonly type: string;
  readonly marks: readonly Mark[];
}

const SIGNATURES: readonly Signature[] = [
  {
    type: 'image/png',
    marks: [{ at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  { type: 'image/jpeg', marks: [{ at: 0, bytes: [0xff, 0xd8, 0xff] }] },
  { type: 'image/gif', marks: [{ at: 0, bytes: 'GIF87a' }] },
  { type: 'image/gif', marks: [{ at: 0, bytes: 'GIF89a' }] },
  {
    type: 'image/webp',
    marks: [
      { at: 0, bytes: 'RIFF' },
      { at: 8, bytes: 'WEBP' },
    ],
  },
  // `BM` alone starts plenty of texts; the four reserved bytes of the header, zero, no text has.
  {
    type: 'image/bmp',
    marks: [
      { at: 0, bytes: 'BM' },
      { at: 6, bytes: [0, 0, 0, 0] },
    ],
  },
  { type: 'image/x-icon', marks: [{ at: 0, bytes: [0x00, 0x00, 0x01, 0x00] }] },
  { type: 'application/pdf', marks: [{ at: 0, bytes: '%PDF-' }] },
];

/**
 * An SVG document: its root element `<svg`, after what may come before it — a byte-order mark,
 * blank space, the XML declaration, comments and a doctype. A text that only **mentions** `<svg`
 * further on is text.
 */
const SVG_ROOT =
  /^\uFEFF?\s*(?:<\?xml[^>]*\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>/]/i;

/** How many bytes a sequence of UTF-8 cut at the end of the probe may have lost: up to three. */
const MAX_CUT_SEQUENCE = 3;

/**
 * @param head the first bytes of the file — {@link import('./text-shape').BINARY_PROBE_BYTES} of
 *   them, or all of it when it is shorter
 * @param complete whether `head` is the whole file, so a sequence cut at its end is not forgiven
 */
export function contentTypeOf(head: Uint8Array, complete: boolean): string {
  const signed = SIGNATURES.find((signature) =>
    signature.marks.every((mark) => carries(head, mark)),
  );

  if (signed !== undefined) {
    return signed.type;
  }

  if (looksBinary(head) || !isUtf8Prefix(head, complete)) {
    return OCTET_STREAM;
  }

  return SVG_ROOT.test(new TextDecoder('utf-8').decode(head)) ? SVG : PLAIN_TEXT;
}

/**
 * Whether a type is on the preview list — raster images, SVG, PDF and text — and may go out
 * `inline`. Everything else is an `attachment`, which a browser never renders.
 */
export function isPreviewable(contentType: string): boolean {
  return contentType !== OCTET_STREAM;
}

function carries(head: Uint8Array, mark: Mark): boolean {
  const expected =
    typeof mark.bytes === 'string'
      ? [...mark.bytes].map((letter) => letter.charCodeAt(0))
      : mark.bytes;

  return expected.every((byte, index) => head[mark.at + index] === byte);
}

/**
 * UTF-8 as far as it goes: the probe of a longer file may end in the middle of a character, and
 * those last bytes — at most three: a lead byte and its continuations — are not held against it.
 */
function isUtf8Prefix(head: Uint8Array, complete: boolean): boolean {
  if (isUtf8(head)) {
    return true;
  }

  if (complete) {
    return false;
  }

  for (let cut = 1; cut <= Math.min(MAX_CUT_SEQUENCE, head.length); cut += 1) {
    if (
      startsASequence(head.subarray(head.length - cut)) &&
      isUtf8(head.subarray(0, head.length - cut))
    ) {
      return true;
    }
  }

  return false;
}

/** A lead byte of a multi-byte character, and only continuation bytes after it. */
function startsASequence(tail: Uint8Array): boolean {
  return tail.every((byte, index) =>
    index === 0 ? byte >= 0xc2 && byte <= 0xf4 : byte >= 0x80 && byte <= 0xbf,
  );
}
