import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import type { BytesOptions, BytesResponse } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

/** One read of bytes the screen made, as the fake saw it. */
export interface RawCall {
  readonly route: string;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string>>;
  readonly url: string;
}

/** A file of the fake disk of bytes. */
export type RawContent = string | Uint8Array;

/** The fake `GET /files/raw` and `GET /files/archive`, and the way a test drives them. */
export interface FakeRaw {
  readonly files: Map<string, RawContent>;
  readonly calls: RawCall[];

  /** The next read of a route is refused with this, once. */
  refuseNext(route: string, error: AppError): void;

  /** The reads that match wait until the returned function lets them go. */
  hold(match: (call: RawCall) => boolean): () => void;
}

function bytesOf(content: RawContent): Uint8Array {
  return typeof content === 'string' ? new TextEncoder().encode(content) : content;
}

/** A version of some bytes, as the server's `ETag` is one: the same bytes, the same version. */
export function rawVersionOf(content: RawContent): string {
  let hash = 5381;

  for (const byte of bytesOf(content)) {
    hash = ((hash << 5) + hash + byte) | 0;
  }

  return `"raw-${(hash >>> 0).toString(16)}"`;
}

function response(
  status: number,
  body: Uint8Array,
  headers: Readonly<Record<string, string>>,
): BytesResponse {
  const copy = new Uint8Array(body.length);
  copy.set(body);

  return {
    status,
    blob: new Blob([copy.buffer]),
    header: (name) => headers[name.toLowerCase()] ?? null,
  };
}

function refusal(code: string, messageKey: string, params: Record<string, unknown>): AppError {
  return new AppError(code, messageKey, 'trace-raw', params);
}

/** `Range: bytes=a-b` as the server reads one range. */
function rangeOf(header: string | undefined): { start: number; end: number } | null {
  const match = /^bytes=(\d+)-(\d+)$/.exec(header ?? '');
  return match === null ? null : { start: Number(match[1]), end: Number(match[2]) };
}

/**
 * `GET /files/raw` as the backend answers it (plan 07 · F7): the bytes, `206` for a `Range`, `416`
 * past the end with `params.size`, `412` when `If-Match` is not the version, `ETag` always — and
 * `GET /files/archive`, a zip of the paths asked. Over `api.bytes`, so the services run as they
 * ship. Any other read never answers.
 */
export function fakeRaw(
  folder: string,
  initial: Readonly<Record<string, RawContent>> = {},
): FakeRaw {
  const files = new Map<string, RawContent>(Object.entries(initial));
  const calls: RawCall[] = [];
  const refusals: { route: string; error: AppError }[] = [];
  const held: { match: (call: RawCall) => boolean; gate: Promise<void> }[] = [];

  const raw = (call: RawCall): BytesResponse => {
    const path = call.query.get('path') ?? '';
    const content = files.get(path);

    if (content === undefined) {
      throw refusal('FILE_NOT_FOUND', 'files.error.notFound', { path });
    }

    const bytes = bytesOf(content);
    const etag = rawVersionOf(content);
    const ifMatch = call.headers['if-match'];

    if (ifMatch !== undefined && ifMatch !== etag) {
      throw refusal('FILE_CHANGED', 'files.error.changed', { path, currentEtag: etag });
    }

    const range = rangeOf(call.headers['range']);
    const name = path.slice(path.lastIndexOf('/') + 1);
    const disposition =
      call.query.get('download') === 'true'
        ? `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
        : 'inline';

    if (range === null) {
      return response(200, bytes, { etag, 'content-disposition': disposition });
    }

    if (range.start >= bytes.length) {
      throw refusal('RANGE_NOT_SATISFIABLE', 'files.error.rangeNotSatisfiable', {
        path,
        size: bytes.length,
      });
    }

    const end = Math.min(range.end, bytes.length - 1);
    return response(206, bytes.slice(range.start, end + 1), {
      etag,
      'content-range': `bytes ${String(range.start)}-${String(end)}/${String(bytes.length)}`,
    });
  };

  const archive = (call: RawCall): BytesResponse => {
    const paths = call.query.getAll('path');
    const listing = paths.join('\n');
    return response(200, new TextEncoder().encode(`zip:${listing}`), {
      'content-disposition': `attachment; filename="${paths.length === 1 ? (paths[0] ?? '') : 'selection'}.zip"`,
    });
  };

  vi.spyOn(api, 'bytes').mockImplementation(async (url: string, options: BytesOptions = {}) => {
    const [route = '', search = ''] = url.split('?');
    const query = new URLSearchParams(search);

    if (query.get('folder') !== folder) {
      return new Promise(() => undefined);
    }

    const call: RawCall = { route, query, headers: options.headers ?? {}, url };
    calls.push(call);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    await held.find((each) => each.match(call))?.gate;

    const refused = refusals.findIndex((each) => each.route === route);

    if (refused !== -1) {
      const [declared] = refusals.splice(refused, 1);
      throw declared?.error;
    }

    return route === '/files/archive' ? archive(call) : raw(call);
  });

  return {
    files,
    calls,
    refuseNext: (route, error) => {
      refusals.push({ route, error });
    },
    hold: (match) => {
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      held.push({ match, gate });
      return release;
    },
  };
}

/** Stands `URL.createObjectURL` in — jsdom has none — and counts what was made and revoked. */
export function fakeObjectUrls(): { readonly made: Blob[]; readonly revoked: string[] } {
  const made: Blob[] = [];
  const revoked: string[] = [];

  for (const name of ['createObjectURL', 'revokeObjectURL'] as const) {
    if (typeof URL[name] !== 'function') {
      Object.defineProperty(URL, name, { value: () => '', configurable: true, writable: true });
    }
  }

  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    made.push(blob as Blob);
    return `blob:http://localhost/object-${String(made.length)}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    revoked.push(url);
  });

  return { made, revoked };
}
