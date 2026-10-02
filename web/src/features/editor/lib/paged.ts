import type { AppError } from '@/shared/api/errors';

/**
 * The paged, read-only views of a file the editor does not open (B-51, 07 · D-04's third step):
 * a binary file in hexadecimal, and a text past the editing ceiling a page of text at a time — both
 * read by `Range` on `GET /files/raw`, never whole.
 */
export type PagedMode = 'hex' | 'text';

/** Bytes per page of the hexadecimal view: 256 rows of 16. */
export const HEX_PAGE_BYTES = 4_096;

/** Bytes per page of the paged text. */
export const TEXT_PAGE_BYTES = 65_536;

/** Bytes per row of the hexadecimal view. */
export const HEX_ROW_BYTES = 16;

/**
 * The longest a UTF-8 character runs past the end of a page: the page of text asks for these few
 * more, to finish the character its last byte starts.
 */
export const UTF8_TAIL = 3;

/** The size of a page of a mode. */
export function pageBytesOf(mode: PagedMode): number {
  return mode === 'hex' ? HEX_PAGE_BYTES : TEXT_PAGE_BYTES;
}

/** How many bytes a page of a mode asks for. */
export function requestBytesOf(mode: PagedMode): number {
  return pageBytesOf(mode) + (mode === 'text' ? UTF8_TAIL : 0);
}

/** How many pages a file has — one, for an empty file, which is an empty page (S-315). */
export function pageCountOf(size: number, mode: PagedMode): number {
  return Math.max(1, Math.ceil(size / pageBytesOf(mode)));
}

/**
 * Which paged view a file that did not open in the editor gets — `null` for a refusal that is not
 * about what the file is (denied, gone, an encoding to choose).
 */
export function pagedModeOf(failure: AppError | null): PagedMode | null {
  if (failure?.code === 'FILE_NOT_TEXT') {
    return failure.params['reason'] === 'encoding' ? null : 'hex';
  }

  return failure?.code === 'FILE_TOO_LARGE' ? 'text' : null;
}

/** One row of the hexadecimal view. */
export interface HexRow {
  /** The offset in the file, eight hexadecimal digits. */
  readonly offset: string;

  /** The bytes, two digits each, separated by a space. */
  readonly hex: string;

  /** The bytes as printable ASCII, a dot for anything else. */
  readonly text: string;
}

function hexOf(value: number, digits: number): string {
  return value.toString(16).padStart(digits, '0');
}

function printable(byte: number): string {
  return byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.';
}

/** The rows of a page of the hexadecimal view — the last one as short as the file is (S-315). */
export function hexRowsOf(bytes: Uint8Array, start: number): readonly HexRow[] {
  const rows: HexRow[] = [];

  for (let at = 0; at < bytes.length; at += HEX_ROW_BYTES) {
    const row = [...bytes.subarray(at, at + HEX_ROW_BYTES)];
    rows.push({
      offset: hexOf(start + at, 8),
      hex: row.map((byte) => hexOf(byte, 2)).join(' '),
      text: row.map(printable).join(''),
    });
  }

  return rows;
}

/** Whether a byte continues a UTF-8 character started before it. */
function continues(byte: number | undefined): boolean {
  return byte !== undefined && (byte & 0xc0) === 0x80;
}

/**
 * The text of a page, whole characters only: the bytes a character of the page before left over are
 * skipped, and the character the page's last byte starts is finished from the few bytes asked past
 * it — a page boundary never shows half a character as `�`.
 *
 * @param nominal the bytes the page is, without the tail asked past it
 */
export function textOfPage(bytes: Uint8Array, nominal: number, first: boolean): string {
  let skip = 0;

  while (!first && skip < UTF8_TAIL && continues(bytes[skip])) {
    skip += 1;
  }

  let end = Math.min(nominal, bytes.length);

  while (end < bytes.length && continues(bytes[end])) {
    end += 1;
  }

  return new TextDecoder('utf-8').decode(bytes.subarray(skip, end));
}
