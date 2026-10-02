import { contentTypeOf } from '@domain/files';

/** The images the prompt carries — the ones the Messages API reads (plan 08, D-02). */
export const ATTACHMENT_IMAGE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

/** What an uploaded attachment turned out to be, by its bytes. */
export type AttachmentKind =
  | { readonly kind: 'image'; readonly mediaType: string }
  | { readonly kind: 'text'; readonly mediaType: 'text/plain' }
  | { readonly kind: 'unsupported'; readonly mediaType: string };

/**
 * What an upload is, said by **its bytes** — never by the name or the type the browser declared,
 * which the backend decides nothing by (plan 08, B-45, S-209).
 *
 * An image of the four types goes as a block of image; UTF-8 text without a NUL goes as delimited
 * text. Everything else is refused: an SVG is text, but it is a document with script in it and not
 * what the person meant to say; a PDF, an image of another type and any binary are not read by the
 * prompt. The type a refusal names is the one the bytes have, so the screen says what it was.
 */
export function attachmentKindOf(bytes: Uint8Array): AttachmentKind {
  const sniffed = contentTypeOf(bytes, true);

  if (ATTACHMENT_IMAGE_TYPES.includes(sniffed)) {
    return { kind: 'image', mediaType: sniffed };
  }

  // The sniff decoded the whole of it as UTF-8 and looked for a NUL in the first bytes only; the
  // whole of it is what Claude would read.
  if (sniffed.startsWith('text/plain') && !bytes.includes(0)) {
    return { kind: 'text', mediaType: 'text/plain' };
  }

  return { kind: 'unsupported', mediaType: sniffed.replace(/;.*$/, '') };
}
