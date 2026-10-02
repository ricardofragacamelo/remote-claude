import { api } from '@/shared/api/api';
import { toAppError } from '@/shared/api/errors';
import type {
  DownloadedFile,
  ExistingEntry,
  FileLimits,
  ManifestItem,
  UploadedItem,
} from '../types/transfer';

/**
 * Files in and out of the machine (plan 07 · F7, B-52) — `GET /files/limits`, `GET /files/raw` with
 * `download=true`, `GET /files/archive`, and the upload with its preflight. Through `api.ts`: the
 * credential in the header, never in a URL (07 · D-16); the I/O logged there, at both edges.
 */

function search(fields: readonly (readonly [string, string])[]): string {
  return new URLSearchParams(fields.map(([name, value]) => [name, value])).toString();
}

/** The ceilings, once — the explorer keeps them in its cache. */
export function fetchLimits(): Promise<FileLimits> {
  return api.get<FileLimits>('/files/limits');
}

/** The name in `Content-Disposition` — the RFC 5987 one first, then the plain one. */
export function nameOfDisposition(disposition: string | null): string | null {
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition ?? '')?.[1];

  if (extended !== undefined) {
    try {
      return decodeURIComponent(extended.trim());
    } catch {
      // A malformed name: the plain one, or the caller's.
    }
  }

  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(disposition ?? '')?.[1];
  return plain === undefined ? null : plain.trim();
}

/**
 * A file of the folder, downloaded — `download=true`, which the server records as `file.downloaded`
 * before the first byte (07 · D-02).
 *
 * @throws {import('@/shared/api/errors').AppError} `413` past the download ceiling, `404`, `503` when
 *   the trail cannot record it
 */
export function downloadFile(
  folder: string,
  path: string,
  fallbackName: string,
  signal?: AbortSignal,
): Promise<DownloadedFile> {
  const fields = [
    ['folder', folder],
    ['path', path],
    ['download', 'true'],
  ] as const;

  return downloaded(`/files/raw?${search(fields)}`, fallbackName, signal);
}

/** A download's bytes, by the name the server gave them — or the one asked for. */
async function downloaded(
  url: string,
  fallbackName: string,
  signal: AbortSignal | undefined,
): Promise<DownloadedFile> {
  const response = await api.bytes(url, signal === undefined ? {} : { signal });

  return {
    blob: response.blob,
    name: nameOfDisposition(response.header('content-disposition')) ?? fallbackName,
  };
}

/**
 * Entries of the folder in one zip — a folder, or the whole selection (`path` once per entry,
 * S-359). The server refuses what passes the ceiling before the first byte (`413`, `params.measure`).
 */
export function downloadArchive(
  folder: string,
  paths: readonly string[],
  fallbackName: string,
  signal?: AbortSignal,
): Promise<DownloadedFile> {
  const fields = [['folder', folder] as const, ...paths.map((path) => ['path', path] as const)];

  return downloaded(`/files/archive?${search(fields)}`, fallbackName, signal);
}

interface PreflightDto {
  readonly items: readonly { readonly path: string; readonly existing: ExistingEntry | null }[];
}

/**
 * What each file of an upload would land on, **before** a byte is sent (S-319) — the paths that are
 * taken, and the version there, which "Replace" overwrites and nothing newer. Keyed by the path each
 * item was asked with — relative to `directory` — although the server answers the paths relative to
 * the open folder, as on every route.
 */
export async function preflightUpload(
  folder: string,
  directory: string,
  items: readonly { readonly path: string; readonly size: number }[],
): Promise<ReadonlyMap<string, ExistingEntry>> {
  const answer = await api.post<PreflightDto>('/files/upload/preflight', {
    folder,
    directory,
    items,
  });

  const existing = new Map(answer.items.map((item) => [item.path, item.existing]));

  return new Map(
    items.flatMap((item) => {
      const there =
        existing.get(directory === '' ? item.path : `${directory}/${item.path}`) ?? null;
      return there === null ? [] : [[item.path, there] as const];
    }),
  );
}

/** What an upload sends. */
export interface UploadRequest {
  readonly folder: string;
  readonly directory: string;
  readonly manifest: readonly ManifestItem[];

  /** The files, in the order of the manifest — the parts go in that order. */
  readonly files: readonly File[];
  readonly confirmSensitive: boolean;
  readonly signal?: AbortSignal;
  onProgress?(loaded: number, total: number): void;
}

/** The answer of an upload, as `file-transfer.dto.ts` writes it — the model's, but the error raw. */
interface UploadedDto {
  readonly items: readonly (
    | Exclude<UploadedItem, { readonly status: 'failed' }>
    | { readonly path: string; readonly status: 'failed'; readonly error: unknown }
  )[];
}

/**
 * Sends files into a directory of the folder, in one multipart request: the fields first, then each
 * file in the order of the manifest. `200` — every one went; `207` — some did not, each with its
 * error. A refusal of the whole upload (a ceiling, a name, the second step of a sensitive path) is
 * thrown before any file was written.
 *
 * @throws {import('@/shared/api/errors').AppError} `400`, `413`, `428`; `NETWORK_UNREACHABLE` when it
 *   was cancelled or the connection fell — no file is ever left half-written (S-322)
 */
export async function uploadFiles(request: UploadRequest): Promise<readonly UploadedItem[]> {
  const form = new FormData();
  form.append('folder', request.folder);
  form.append('directory', request.directory);
  form.append('manifest', JSON.stringify(request.manifest));
  form.append('confirmSensitive', String(request.confirmSensitive));

  for (const file of request.files) {
    form.append('file', file, file.name);
  }

  const { body } = await api.upload<UploadedDto>('/files/upload', form, {
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    ...(request.onProgress === undefined ? {} : { onProgress: request.onProgress }),
  });

  return body.items.map((item): UploadedItem =>
    item.status === 'failed'
      ? { path: item.path, status: 'failed', error: toAppError({ error: item.error }, 'upload') }
      : item,
  );
}
