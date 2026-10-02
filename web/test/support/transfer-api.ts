import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import type { BytesResponse, RequestOptions, UploadOptions } from '@/shared/api/api';
import { AppError, toTransportError } from '@/shared/api/errors';
import type { FileLimits, HistoryKeeping, ManifestItem } from '@/features/explorer/types/transfer';
import { etagOf, filesRefusal } from './files-api';
import type { FakeFolder } from './files-api';

/** The ceilings the fake server says, unless a test says others. */
export const LIMITS: FileLimits = {
  maxEditBytes: 10_000_000,
  largeFileBytes: 1_000_000,
  downloadMaxBytes: 200_000_000,
  archiveMaxEntries: 10_000,
  uploadMaxBytes: 100_000_000,
  uploadMaxEntries: 1_000,
  uploadMaxTotalBytes: 500_000_000,
  historyMaxFileBytes: 10_000_000,
};

/** One upload, as the fake server read its form. */
export interface UploadCall {
  readonly folder: string;
  readonly directory: string;
  readonly manifest: readonly ManifestItem[];
  readonly names: readonly string[];
  readonly confirmSensitive: boolean;
}

/** One read of bytes — a download — as the fake saw it. */
export interface BytesCall {
  readonly route: string;
  readonly query: URLSearchParams;
  readonly url: string;
}

/** An upload held on its way: the test says how far it went, and lets it land. */
export interface HeldUpload {
  progress(loaded: number, total: number): void;
  release(): void;
}

export interface FakeTransfer {
  readonly uploads: UploadCall[];
  readonly preflights: Record<string, unknown>[];
  readonly downloads: BytesCall[];

  /** The next upload waits for the test — `held()` once it is on its way. */
  holdUpload(): () => HeldUpload | undefined;

  /** The next upload, or the next download, is refused whole with this, once. */
  refuseNextUpload(error: AppError): void;
  refuseNextDownload(error: AppError): void;
}

export interface FakeTransferOptions {
  /** The answer of `GET /files/limits` — or a refusal. */
  readonly limits?: FileLimits | AppError;

  /** What the local history did with the version a replace overwrote — kept, unless said. */
  readonly history?: HistoryKeeping;
}

const SENSITIVE = ['.claude/settings.json', '.claude/settings.local.json', '.mcp.json'];

function previous(method: unknown): ((...args: unknown[]) => Promise<unknown>) | undefined {
  return vi.isMockFunction(method)
    ? (method.getMockImplementation() as ((...args: unknown[]) => Promise<unknown>) | undefined)
    : undefined;
}

function joined(directory: string, path: string): string {
  return directory === '' ? path : `${directory}/${path}`;
}

/** `name copy.ext`, as the server keeps both. */
function copyName(path: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash + 1 ? `${path.slice(0, dot)} copy${path.slice(dot)}` : `${path} copy`;
}

/** One item of an upload, applied to the disk as the backend does — paths relative to the folder. */
function landItem(
  disk: FakeFolder,
  path: string,
  item: ManifestItem,
  content: string,
  history: HistoryKeeping,
): unknown {
  const existing = disk.entries.get(path);

  if (existing === undefined) {
    disk.put(path, content);
    return { path, status: 'created', etag: etagOf(content) };
  }

  if (item.onConflict === 'keepBoth') {
    const renamed = copyName(path);
    disk.put(renamed, content);
    return { path: renamed, status: 'renamed', etag: etagOf(content) };
  }

  if (item.onConflict === 'replace' && item.ifMatch === etagOf(existing.content ?? '')) {
    disk.put(path, content);
    return { path, status: 'replaced', etag: etagOf(content), history };
  }

  const error =
    item.onConflict === 'replace'
      ? { code: 'FILE_CHANGED', messageKey: 'files.error.changed', params: { path } }
      : { code: 'FILE_EXISTS', messageKey: 'files.error.exists', params: { path } };
  return { path, status: 'failed', error };
}

function bytesResponse(body: string, disposition: string): BytesResponse {
  return {
    status: 200,
    blob: new Blob([body]),
    header: (name) => (name.toLowerCase() === 'content-disposition' ? disposition : null),
  };
}

/**
 * The transfer routes of `files` over a fake folder (plan 07 · F7): `GET /files/limits`, the
 * preflight, the upload (multipart, `200` or `207`, `428` for a sensitive path unconfirmed) and the
 * downloads — `raw?download=true` and `archive`. Installed **after** the folder's own fake: it answers
 * its routes and hands every other to it.
 */
export function fakeTransfer(disk: FakeFolder, options: FakeTransferOptions = {}): FakeTransfer {
  const uploads: UploadCall[] = [];
  const preflights: Record<string, unknown>[] = [];
  const downloads: BytesCall[] = [];
  const refusals: { upload: AppError[]; download: AppError[] } = { upload: [], download: [] };
  let holding = false;
  let held: HeldUpload | undefined;
  const before = { get: previous(api.get), post: previous(api.post) };

  vi.spyOn(api, 'get').mockImplementation(async (path: string, request?: RequestOptions) => {
    if (path !== '/files/limits') {
      return (before.get as (p: string, o?: RequestOptions) => Promise<never>)(path, request);
    }

    const limits = options.limits ?? LIMITS;

    if (limits instanceof AppError) {
      throw limits;
    }

    return limits as never;
  });

  vi.spyOn(api, 'post').mockImplementation(
    async (path: string, body: unknown, request?: RequestOptions) => {
      if (path !== '/files/upload/preflight') {
        return (before.post as (p: string, b: unknown, o?: RequestOptions) => Promise<never>)(
          path,
          body,
          request,
        );
      }

      const fields = body as { directory: string; items: { path: string }[] };
      preflights.push(body as Record<string, unknown>);

      return {
        // Relative to the open folder, as the backend answers every path.
        items: fields.items.map((item) => {
          const entry = disk.entries.get(joined(fields.directory, item.path));
          return {
            path: joined(fields.directory, item.path),
            existing:
              entry === undefined
                ? null
                : {
                    kind: entry.kind,
                    etag: entry.kind === 'file' ? etagOf(entry.content ?? '') : null,
                  },
          };
        }),
      } as never;
    },
  );

  vi.spyOn(api, 'upload').mockImplementation(
    async (_path: string, form: FormData, request: UploadOptions = {}) => {
      const manifest = JSON.parse(String(form.get('manifest'))) as ManifestItem[];
      const files = form.getAll('file') as File[];
      const call: UploadCall = {
        folder: String(form.get('folder')),
        directory: String(form.get('directory')),
        manifest,
        names: files.map((file) => file.name),
        confirmSensitive: form.get('confirmSensitive') === 'true',
      };
      uploads.push(call);

      if (holding) {
        holding = false;
        await new Promise<void>((resolve, reject) => {
          held = {
            progress: (loaded, total) => {
              request.onProgress?.(loaded, total);
            },
            release: resolve,
          };
          request.signal?.addEventListener('abort', () => {
            reject(toTransportError('trace-upload'));
          });
        });
      }

      const refusal = refusals.upload.shift();

      if (refusal !== undefined) {
        throw refusal;
      }

      const sensitive = manifest.find((item) =>
        SENSITIVE.includes(joined(call.directory, item.path)),
      );

      if (sensitive !== undefined && !call.confirmSensitive) {
        throw filesRefusal('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
          path: joined(call.directory, sensitive.path),
          reason: 'sensitiveFile',
        });
      }

      const items = await Promise.all(
        manifest.map(async (item, index) =>
          landItem(
            disk,
            joined(call.directory, item.path),
            item,
            (await files[index]?.text()) ?? '',
            options.history ?? { kept: true, entryId: 'h-1' },
          ),
        ),
      );
      const failed = items.some((item) => (item as { status: string }).status === 'failed');

      return { status: failed ? 207 : 200, body: { items } as never };
    },
  );

  vi.spyOn(api, 'bytes').mockImplementation(async (url: string) => {
    const [route = '', search = ''] = url.split('?');
    const query = new URLSearchParams(search);
    downloads.push({ route, query, url });

    const refusal = refusals.download.shift();

    if (refusal !== undefined) {
      throw refusal;
    }

    if (route === '/files/archive') {
      const paths = query.getAll('path');
      return bytesResponse(`zip:${paths.join(',')}`, 'attachment; filename="served.zip"');
    }

    const path = query.get('path') ?? '';
    const entry = disk.entries.get(path);
    const name = path.slice(path.lastIndexOf('/') + 1);

    return bytesResponse(
      entry?.content ?? '',
      `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
  });

  return {
    uploads,
    preflights,
    downloads,
    holdUpload: () => {
      holding = true;
      return () => held;
    },
    refuseNextUpload: (error) => {
      refusals.upload.push(error);
    },
    refuseNextDownload: (error) => {
      refusals.download.push(error);
    },
  };
}

/** What the page saved by a link to a blob: the name, and the bytes. */
export interface SavedLinks {
  readonly saved: { readonly name: string; readonly href: string; readonly blob: Blob }[];
}

/**
 * Catches the downloads the page saves by a link — the `<a download>` it clicks — with the blob each
 * one was made of. jsdom navigates nowhere.
 */
export function catchSavedLinks(): SavedLinks {
  const saved: SavedLinks['saved'][number][] = [];
  const blobs = new Map<string, Blob>();
  let made = 0;

  for (const name of ['createObjectURL', 'revokeObjectURL'] as const) {
    if (typeof URL[name] !== 'function') {
      Object.defineProperty(URL, name, { value: () => '', configurable: true, writable: true });
    }
  }

  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    made += 1;
    const url = `blob:http://localhost/download-${String(made)}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(
    this: HTMLAnchorElement,
  ) {
    const href = this.getAttribute('href') ?? '';
    saved.push({ name: this.download, href, blob: blobs.get(href) as Blob });
  });

  return { saved };
}
