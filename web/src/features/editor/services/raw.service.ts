import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

/**
 * The bytes of a file as `GET /files/raw` serves them (plan 07 · F7, backend/03): what the previews
 * draw and the paged views read. Through `api.ts` like every request — the credential in the header,
 * never in the URL (07 · D-16) — and never navigated to: the page only ever holds a blob of it
 * (07 · D-18).
 */

/** A whole file, for a preview. */
export interface RawFile {
  readonly blob: Blob;

  /** The version it was read as — `null` when the server named none. */
  readonly etag: string | null;
}

/** One page of a file, read by `Range`. */
export interface RawPage {
  readonly bytes: Uint8Array;

  /** The version the page belongs to — what the next page is asked with, in `If-Match`. */
  readonly etag: string | null;

  /** The size of the whole file, as `Content-Range` said it. */
  readonly size: number;

  /** Where the page starts in the file. */
  readonly start: number;
}

function rawPath(folder: string, path: string): string {
  return `/files/raw?${new URLSearchParams({ folder, path }).toString()}`;
}

/** The size after the slash of `Content-Range: bytes 0-4095/123456`, when there is one. */
function totalOf(contentRange: string | null): number | null {
  const total = contentRange?.split('/')[1];
  const size = total === undefined ? Number.NaN : Number(total);

  return Number.isInteger(size) && size >= 0 ? size : null;
}

/**
 * A whole file, for a preview — an image, an SVG, a PDF, an image a markdown text shows.
 *
 * @throws {AppError} as the server answered — `404`, `413` past the download ceiling, `422`
 */
export async function readRaw(
  folder: string,
  path: string,
  signal?: AbortSignal,
): Promise<RawFile> {
  const response = await api.bytes(rawPath(folder, path), signal === undefined ? {} : { signal });

  return { blob: response.blob, etag: response.header('etag') };
}

/** What a page is asked with. */
export interface PageRequest {
  readonly folder: string;
  readonly path: string;
  readonly start: number;
  readonly length: number;

  /** The version of the pages read before — the server answers `412` once the file is another. */
  readonly ifMatch: string | null;
  readonly signal?: AbortSignal;
}

/** Whether a refusal is the server saying an empty file has no first page. */
function isEmptyFile(error: unknown, start: number): error is AppError {
  return error instanceof AppError && error.code === 'RANGE_NOT_SATISFIABLE' && start === 0;
}

/**
 * One page of a file, by `Range` (B-51): `206` with the page and the size of the file. A server that
 * answers the whole file (`200`) gives the page from it; a file of zero bytes has no page to give —
 * its first one is `416`, and is the empty page.
 *
 * @throws {AppError} `FILE_CHANGED` (`412`) once the file is no longer the version of `ifMatch` — the
 *   view never shows pages of two versions (S-317); `RANGE_NOT_SATISFIABLE` past the end
 */
export async function readPage(request: PageRequest): Promise<RawPage> {
  const { start, length } = request;
  const headers: Record<string, string> = {
    range: `bytes=${String(start)}-${String(start + length - 1)}`,
  };

  if (request.ifMatch !== null) {
    headers['if-match'] = request.ifMatch;
  }

  try {
    const response = await api.bytes(rawPath(request.folder, request.path), {
      headers,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const bytes = new Uint8Array(await response.blob.arrayBuffer());
    const whole = response.status === 200;

    return {
      bytes: whole ? bytes.slice(start, start + length) : bytes,
      etag: response.header('etag'),
      size: (whole ? null : totalOf(response.header('content-range'))) ?? bytes.length,
      start,
    };
  } catch (error) {
    if (isEmptyFile(error, start)) {
      const size = error.params['size'];
      return {
        bytes: new Uint8Array(0),
        etag: null,
        size: typeof size === 'number' ? size : 0,
        start,
      };
    }

    throw error;
  }
}
