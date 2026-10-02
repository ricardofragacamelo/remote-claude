/**
 * Bytes and text, in an encoding this server knows.
 *
 * A port because the encodings past UTF-8 and UTF-16 ("reopen with encoding" — windows-1252,
 * ISO-8859-1, Shift-JIS, GBK…) come from a library, and the application does not import one
 * ([07 · D-04](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-04--teto-de-tamanho-e-encoding)).
 *
 * Encodings are named in a canonical form — lower case, without `-` or `_`: `utf8`, `utf16le`,
 * `windows1252`.
 */
export interface TextCodec {
  /** Whether this server can read and write `encoding`. */
  supports(encoding: string): boolean;

  /** The text in `bytes`. An explicitly chosen encoding decodes whatever is there. */
  decode(bytes: Uint8Array, encoding: string): string;

  /** The bytes of `text`, or `null` when a character has no representation in `encoding`. */
  encode(text: string, encoding: string): Uint8Array | null;
}

export const TEXT_CODEC = Symbol('TextCodec');
