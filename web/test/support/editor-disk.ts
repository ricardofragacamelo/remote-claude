import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import type { RequestOptions } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

/** A refusal, as `api.ts` hands it over. */
export function refused(
  code: string,
  messageKey: string,
  params: Readonly<Record<string, unknown>> = {},
): AppError {
  return new AppError(code, messageKey, 'trace-editor', params);
}

/** A version of a text, as the server's `ETag` is one: the same text, the same version. */
export function versionOf(content: string): string {
  let hash = 5381;

  for (const character of content) {
    hash = ((hash << 5) + hash + (character.codePointAt(0) ?? 0)) | 0;
  }

  return `"${String(content.length)}-${(hash >>> 0).toString(16)}"`;
}

/** What the fake disk holds of one file. */
export interface DiskFile {
  content: string;
  encoding?: string;
  eol?: 'lf' | 'crlf' | 'mixed';
  largeFile?: boolean;

  /** A read of it is refused with this — binary, too large, denied. */
  unreadable?: AppError;
}

/** One request the editor made, as the fake saw it. */
export interface DiskCall {
  readonly method: 'GET' | 'PUT' | 'POST';
  readonly route: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>> | undefined;
}

/**
 * A fake disk behind the `files` routes the editor uses, and the way a test drives it. `files` is
 * keyed by the path under the folder of the first disk — a disk made over another shares it.
 */
export interface FakeDisk {
  readonly files: Map<string, DiskFile>;
  readonly calls: DiskCall[];

  /** Someone else — Claude, a terminal — writes a file, behind the editor's back. */
  write(path: string, content: string): void;
  remove(path: string): void;
  versionOf(path: string): string | null;

  /** The next saves are refused with these, in order. */
  refuseSaves(...errors: AppError[]): void;

  /** The next requests of a method wait until `release()` — a request on its way. */
  hold(method: 'PUT' | 'POST' | 'GET'): void;
  release(): void;

  /** The saves sent, in order. */
  saves(): DiskCall[];
}

/** The search of a request path. */
function searchOf(path: string): URLSearchParams {
  return new URLSearchParams(path.slice(path.indexOf('?') + 1));
}

/** What a method of the client was already faked with, if anything — another fake's routes. */
function previous(method: unknown): ((...args: unknown[]) => Promise<unknown>) | undefined {
  return vi.isMockFunction(method)
    ? (method.getMockImplementation() as ((...args: unknown[]) => Promise<unknown>) | undefined)
    : undefined;
}

function never<T>(): Promise<T> {
  return new Promise(() => undefined);
}

const SENSITIVE = ['.claude/settings.json', '.claude/settings.local.json', '.mcp.json'];

/**
 * A folder's files behind the routes the editor calls — `GET /files/content` (with `If-None-Match`
 * and its `304`), `PUT /files/content` (with `If-Match`, its `412` and `428`), `POST /files` (with
 * `409`) and `GET /files/tree` — over the real `api.ts`, so the service and the transport run as
 * they ship. Any other request goes to whatever faked it before, or never answers.
 */
export function fakeDisk(
  folder: string,
  initial: Readonly<Record<string, string | DiskFile>>,
  shared?: { readonly disk: FakeDisk; readonly prefix: string },
): FakeDisk {
  const files = shared?.disk.files ?? new Map<string, DiskFile>();
  for (const [path, file] of Object.entries(initial)) {
    files.set(path, typeof file === 'string' ? { content: file } : file);
  }

  // A folder under another one sees the same disk: its paths are the other's, under a prefix.
  const at = (path: string): string => `${shared?.prefix ?? ''}${path}`;
  const calls: DiskCall[] = [];
  const refusals: AppError[] = [];
  const held: { method: string; resume: () => void }[] = [];
  let holding: string | null = null;

  const wait = async (method: string): Promise<void> => {
    if (holding === method) {
      await new Promise<void>((resume) => {
        held.push({ method, resume });
      });
    }
  };

  const read = (path: string, headers: Readonly<Record<string, string>>): Promise<unknown> => {
    const file = files.get(at(path));

    if (file === undefined) {
      return Promise.reject(refused('FILE_NOT_FOUND', 'files.error.notFound', { path }));
    }

    if (file.unreadable !== undefined) {
      return Promise.reject(file.unreadable);
    }

    const etag = versionOf(file.content);

    if (headers['if-none-match'] === etag) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve({
      path,
      content: file.content,
      etag,
      encoding: file.encoding ?? 'utf8',
      bom: false,
      eol: file.eol ?? 'lf',
      size: file.content.length,
      mtime: '2026-10-01T00:00:00.000Z',
      largeFile: file.largeFile ?? false,
    });
  };

  const save = (
    body: Readonly<Record<string, unknown>>,
    headers: Readonly<Record<string, string>>,
  ): Promise<unknown> => {
    const path = String(body['path']);
    const content = String(body['content']);
    const file = files.get(at(path));
    const refusal = refusals.shift();

    if (refusal !== undefined) {
      return Promise.reject(refusal);
    }

    if (headers['if-match'] === undefined) {
      return Promise.reject(
        refused('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
          path,
          reason: 'ifMatchMissing',
        }),
      );
    }

    if (SENSITIVE.includes(path) && body['confirmSensitive'] !== true) {
      return Promise.reject(
        refused('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
          path,
          reason: 'sensitiveFile',
        }),
      );
    }

    const current = file === undefined ? null : versionOf(file.content);

    if (current === null || (headers['if-match'] !== current && versionOf(content) !== current)) {
      return Promise.reject(
        refused('FILE_CHANGED', 'files.error.changed', { path, currentEtag: current }),
      );
    }

    files.set(at(path), { ...file, content, encoding: String(body['encoding']) });
    return Promise.resolve({ path, etag: versionOf(content), size: content.length });
  };

  const create = (body: Readonly<Record<string, unknown>>): Promise<unknown> => {
    const path = String(body['path']);
    const existing = files.get(at(path));

    if (existing !== undefined) {
      return Promise.reject(
        refused('FILE_EXISTS', 'files.error.exists', {
          path,
          currentEtag: versionOf(existing.content),
        }),
      );
    }

    const content = String(body['content'] ?? '');
    files.set(at(path), { content });
    return Promise.resolve({ path, etag: versionOf(content) });
  };

  const tree = (path: string): Promise<unknown> => {
    const prefix = path === '' ? '' : `${path}/`;
    const names = new Map<string, 'file' | 'directory'>();

    for (const each of files.keys()) {
      if (each.startsWith(at(prefix))) {
        const [name = '', ...rest] = each.slice(at(prefix).length).split('/');
        names.set(name, rest.length > 0 ? 'directory' : 'file');
      }
    }

    return Promise.resolve({
      folder,
      path,
      truncated: false,
      entries: [...names].map(([name, kind]) => ({
        name,
        path: `${prefix}${name}`,
        kind,
        size: 0,
        mtime: '2026-10-01T00:00:00.000Z',
        hidden: false,
        unreadableName: false,
        outside: false,
        targetKind: null,
      })),
    });
  };

  const before = { get: previous(api.get), put: previous(api.put), post: previous(api.post) };

  vi.spyOn(api, 'get').mockImplementation(async (route: string, options: RequestOptions = {}) => {
    const asked = searchOf(route);

    if (!route.startsWith('/files/') || asked.get('folder') !== folder) {
      return before.get === undefined ? never() : before.get(route, options);
    }

    const headers = options.headers ?? {};
    const path = asked.get('path') ?? '';
    calls.push({ method: 'GET', route: route.split('?')[0] ?? '', path, headers, body: undefined });
    await wait('GET');

    return route.startsWith('/files/tree') ? tree(path) : read(path, headers);
  });

  vi.spyOn(api, 'put').mockImplementation(
    async (route: string, body: unknown, options: RequestOptions = {}) => {
      const fields = body as Readonly<Record<string, unknown>>;

      if (route !== '/files/content' || fields['folder'] !== folder) {
        return before.put === undefined ? never() : before.put(route, body, options);
      }

      const headers = options.headers ?? {};
      calls.push({ method: 'PUT', route, path: String(fields['path']), headers, body: fields });
      await wait('PUT');
      return save(fields, headers);
    },
  );

  vi.spyOn(api, 'post').mockImplementation(
    async (route: string, body: unknown, options: RequestOptions = {}) => {
      const fields = body as Readonly<Record<string, unknown>>;

      if (route !== '/files' || fields['folder'] !== folder) {
        return before.post === undefined ? never() : before.post(route, body, options);
      }

      calls.push({
        method: 'POST',
        route,
        path: String(fields['path']),
        headers: options.headers ?? {},
        body: fields,
      });
      await wait('POST');
      return create(fields);
    },
  );

  return {
    files,
    calls,
    write: (path, content) => {
      files.set(at(path), { ...files.get(at(path)), content });
    },
    remove: (path) => {
      files.delete(at(path));
    },
    versionOf: (path) => {
      const file = files.get(at(path));
      return file === undefined ? null : versionOf(file.content);
    },
    refuseSaves: (...errors) => {
      refusals.push(...errors);
    },
    hold: (method) => {
      holding = method;
    },
    release: () => {
      holding = null;

      for (const each of held.splice(0)) {
        each.resume();
      }
    },
    saves: () => calls.filter((call) => call.method === 'PUT'),
  };
}
