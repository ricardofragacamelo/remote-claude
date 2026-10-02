import { Injectable } from '@nestjs/common';
import iconv from 'iconv-lite';

import type { TextCodec } from '@application/files';

/**
 * Text and bytes through `iconv-lite` — the encodings past UTF-8 that "reopen with encoding" offers
 * (windows-1252, ISO-8859-1/15, Shift-JIS, GBK…) ([07 · D-04](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-04--teto-de-tamanho-e-encoding)).
 *
 * `iconv-lite` writes `?` for a character the encoding has no byte for, in silence. A save that
 * changes characters is a save that loses work, so an encoding is accepted only when decoding what
 * was encoded gives the text back (S-73).
 */
@Injectable()
export class IconvTextCodec implements TextCodec {
  supports(encoding: string): boolean {
    return iconv.encodingExists(encoding);
  }

  decode(bytes: Uint8Array, encoding: string): string {
    // The mark, when there is one, was taken off by the caller, which knows whether it belongs.
    return iconv.decode(Buffer.from(bytes), encoding, { stripBOM: false });
  }

  encode(text: string, encoding: string): Uint8Array | null {
    const bytes = iconv.encode(text, encoding, { addBOM: false });

    return iconv.decode(bytes, encoding, { stripBOM: false }) === text ? bytes : null;
  }
}
