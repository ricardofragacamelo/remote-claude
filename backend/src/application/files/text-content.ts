import {
  byteOrderMarkOf,
  endOfLineOf,
  FileNotEncodableError,
  FileNotTextError,
  isUtf8,
  looksBinary,
  markOf,
  UnknownEncodingError,
} from '@domain/files';
import type { EndOfLine, MarkedEncoding } from '@domain/files';
import type { TextCodec } from './ports/text-codec.port';

/** A file's bytes, as text the editor can hold. */
export interface DecodedText {
  /** Without the byte-order mark. */
  readonly content: string;
  readonly encoding: string;
  /** Whether a byte-order mark was there — and is written back on a save that asks for it. */
  readonly bom: boolean;
  readonly eol: EndOfLine;
}

/** The encodings a byte-order mark names, which are also the ones where a NUL is ordinary text. */
const MARKED: readonly string[] = ['utf8', 'utf16le', 'utf16be'];
const WIDE: readonly string[] = ['utf16le', 'utf16be'];

/**
 * The canonical name of an encoding: lower case, without `-` or `_` — `UTF-8` and `utf_8` are
 * `utf8`, `Windows-1252` is `windows1252`.
 */
export function canonicalEncoding(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, '');
}

/**
 * Text from bytes, by the rules of [07 · D-04](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-04--teto-de-tamanho-e-encoding):
 * the encoding the person chose, or the one a byte-order mark names, or valid UTF-8 — and nothing
 * else, ever guessed.
 *
 * @param requested the encoding asked for ("reopen with encoding"), or `null` to detect
 * @throws {UnknownEncodingError} asked for one this server does not know (S-50)
 * @throws {FileNotTextError} a NUL in the first 8 KB (`binary`), or not UTF-8 with nothing asked
 *   for (`encoding`) — never a guess (S-44, S-46)
 */
export function decodeText(
  path: string,
  bytes: Uint8Array,
  requested: string | null,
  codec: TextCodec,
): DecodedText {
  const encoding = knownEncoding(requested, codec);
  const mark = byteOrderMarkOf(bytes);
  const chosen = encoding ?? mark?.encoding ?? 'utf8';

  refuseWhatIsNotText(path, bytes, chosen, encoding === null && mark === null);

  // A mark is stripped only when it belongs to the encoding the text is read in.
  const marked = mark?.encoding === chosen;
  const content = codec.decode(marked ? bytes.subarray(mark.length) : bytes, chosen);

  return { content, encoding: chosen, bom: marked, eol: endOfLineOf(content) };
}

/** The canonical name of the encoding asked for, or `null` when none was. */
function knownEncoding(requested: string | null, codec: TextCodec): string | null {
  if (requested === null) {
    return null;
  }

  const encoding = canonicalEncoding(requested);

  if (!codec.supports(encoding)) {
    throw new UnknownEncodingError(requested);
  }

  return encoding;
}

/**
 * A binary — a NUL early on, which in UTF-16 is ordinary text — or, when nothing said which
 * encoding, bytes that are not UTF-8.
 */
function refuseWhatIsNotText(
  path: string,
  bytes: Uint8Array,
  encoding: string,
  mustBeUtf8: boolean,
): void {
  if (!WIDE.includes(encoding) && looksBinary(bytes)) {
    throw new FileNotTextError(path, 'binary');
  }

  if (mustBeUtf8 && !isUtf8(bytes)) {
    throw new FileNotTextError(path, 'encoding');
  }
}

/**
 * Bytes from text, in the encoding the file was opened in — the line endings exactly as they came
 * (S-72), the byte-order mark only where one exists and was asked for.
 *
 * @throws {UnknownEncodingError} an encoding this server does not know
 * @throws {FileNotEncodableError} a character the encoding cannot represent — never written as `?`
 *   (S-73)
 */
export function encodeText(
  path: string,
  content: string,
  requested: string,
  bom: boolean,
  codec: TextCodec,
): Uint8Array {
  const encoding = canonicalEncoding(requested);

  if (!codec.supports(encoding)) {
    throw new UnknownEncodingError(requested);
  }

  const body = codec.encode(content, encoding);

  if (body === null) {
    throw new FileNotEncodableError(path, encoding);
  }

  if (!bom || !MARKED.includes(encoding)) {
    return body;
  }

  const mark = markOf(encoding as MarkedEncoding);
  const bytes = new Uint8Array(mark.length + body.length);
  bytes.set(mark);
  bytes.set(body, mark.length);

  return bytes;
}
