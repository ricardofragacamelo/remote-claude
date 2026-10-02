import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import type { RequestOptions } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

/** One entry of the fake folder. */
export interface FakeEntry {
  readonly kind: 'file' | 'directory' | 'symlink';
  content?: string;
  mtime?: string;
  readonly hidden?: boolean;
  readonly outside?: boolean;
  readonly unreadableName?: boolean;
  readonly targetKind?: 'file' | 'directory' | 'missing' | null;
}

/** One request the screen made, as the fake saw it. */
export interface FakeCall {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly route: string;
  readonly query: URLSearchParams;
  readonly body: Record<string, unknown> | undefined;
  readonly headers: Readonly<Record<string, string>>;
}

/** The paths that change what Claude may do (07 · D-15). */
const SENSITIVE = ['.claude/settings.json', '.claude/settings.local.json', '.mcp.json'];

/** A refusal, as `api.ts` hands it over. */
export function filesRefusal(
  code: string,
  messageKey: string,
  params: Readonly<Record<string, unknown>> = {},
): AppError {
  return new AppError(code, messageKey, 'trace-files', params);
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function within(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/** A version of a file's text, as the server's `ETag` is one. */
export function etagOf(content: string): string {
  return `"${String(content.length)}:${content}"`;
}

/** What a method of the client was already faked with, if anything. */
function previous(method: unknown): ((...args: unknown[]) => Promise<unknown>) | undefined {
  return vi.isMockFunction(method)
    ? (method.getMockImplementation() as ((...args: unknown[]) => Promise<unknown>) | undefined)
    : undefined;
}

/** A request nobody answers. */
function never<T>(): Promise<T> {
  return new Promise(() => undefined);
}

export interface FakeFolderOptions {
  /** Levels listed as cut by the ceiling. */
  readonly truncated?: readonly string[];

  /** The answer of `GET /audit-events`, or a refusal. */
  readonly auditEvents?: (query: URLSearchParams) => unknown;

  /** The local history behind the folder (07 · F8) — without one, a delete never fits in it. */
  readonly history?: FakeFolderHistory;
}

/** What answers the local history's part of the `files` routes, over a {@link FakeFolder}. */
export interface FakeFolderHistory {
  /** A delete with `keepInHistory=true` the fake already checked: keeps what goes, and answers. */
  keep(folder: FakeFolder, path: string): unknown;

  /** A request of `/files/history…`. */
  answer(folder: FakeFolder, call: FakeCall): unknown;
}

/**
 * A folder on a fake disk, behind the `files` routes as the backend answers them — tree, content,
 * create, move, copy and delete, with their refusals (`409`, `412`, `422`, `428`) — so the Explorer
 * is tested through the real service and the real `api.ts` boundary.
 *
 * Every other request never answers.
 */
export class FakeFolder {
  readonly entries = new Map<string, FakeEntry>();
  readonly calls: FakeCall[] = [];

  /** A refusal for the next request of a route that matches, once. */
  private readonly refusals: {
    readonly match: (call: FakeCall) => boolean;
    readonly error: AppError;
  }[] = [];

  /** Requests held until the test lets them go. */
  private readonly held: { readonly match: (call: FakeCall) => boolean; gate: Promise<void> }[] =
    [];

  constructor(
    readonly folder: string,
    tree: Readonly<Record<string, FakeEntry | string>> = {},
    readonly options: FakeFolderOptions = {},
  ) {
    for (const [path, entry] of Object.entries(tree)) {
      this.put(path, entry);
    }
  }

  /** Puts an entry on the disk — a string is a file with that text — with its folders. */
  put(path: string, entry: FakeEntry | string): void {
    const parent = parentOf(path);

    if (parent !== '' && !this.entries.has(parent)) {
      this.put(parent, { kind: 'directory' });
    }

    this.entries.set(
      path,
      typeof entry === 'string' ? { kind: 'file', content: entry } : { ...entry },
    );
  }

  /** Takes an entry off the disk, with everything under it — somebody else deleted it. */
  remove(path: string): void {
    for (const each of [...this.entries.keys()]) {
      if (within(each, path)) {
        this.entries.delete(each);
      }
    }
  }

  /** Refuses the next request that matches, once. */
  refuseNext(match: (call: FakeCall) => boolean, error: AppError): void {
    this.refusals.push({ match, error });
  }

  /** Holds the requests that match until the returned function lets them go. */
  hold(match: (call: FakeCall) => boolean): () => void {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.held.push({ match, gate });
    return release;
  }

  /** The calls of one route. */
  callsTo(method: FakeCall['method'], route: string): FakeCall[] {
    return this.calls.filter((call) => call.method === method && call.route === route);
  }

  /** The names in one level, as `GET /files/tree` lists them. */
  listing(path: string): unknown {
    const entries = [...this.entries.entries()]
      .filter(([each]) => each !== path && parentOf(each) === path)
      .map(([each, entry]) => ({
        name: nameOf(each),
        path: each,
        kind: entry.kind,
        size: entry.content?.length ?? 0,
        mtime: entry.mtime ?? '2026-09-30T12:00:00.000Z',
        hidden: entry.hidden ?? false,
        unreadableName: entry.unreadableName ?? false,
        outside: entry.outside ?? false,
        targetKind: entry.targetKind ?? null,
      }));

    return {
      folder: this.folder,
      path,
      entries,
      truncated: this.options.truncated?.includes(path) ?? false,
    };
  }

  /**
   * Stands this folder in for the HTTP client, route by route. A route it does not know goes to
   * whatever stood in before — the fake `workspace` routes of a workbench spec — or never answers.
   */
  install(): this {
    const before = {
      GET: previous(api.get),
      POST: previous(api.post),
      DELETE: previous(api.delete),
    };
    const record = (
      method: 'GET' | 'POST' | 'DELETE',
      path: string,
      body: unknown,
      options: RequestOptions | undefined,
    ): Promise<unknown> => {
      const [route = '', search = ''] = path.split('?');
      const call: FakeCall = {
        method,
        route,
        query: new URLSearchParams(search),
        body: body as Record<string, unknown> | undefined,
        headers: options?.headers ?? {},
      };

      if (!this.knows(call)) {
        const fallback = before[method];
        return fallback === undefined
          ? never()
          : method === 'POST'
            ? fallback(path, body, options)
            : fallback(path, options);
      }

      this.calls.push(call);
      return this.answer(call);
    };

    vi.spyOn(api, 'get').mockImplementation(
      (path: string, options?: RequestOptions) =>
        record('GET', path, undefined, options) as Promise<never>,
    );
    vi.spyOn(api, 'post').mockImplementation(
      (path: string, body: unknown, options?: RequestOptions) =>
        record('POST', path, body, options) as Promise<never>,
    );
    vi.spyOn(api, 'delete').mockImplementation(
      (path: string, options?: RequestOptions) =>
        record('DELETE', path, undefined, options) as Promise<never>,
    );
    return this;
  }

  /** Whether a request is one of the routes this fake answers. */
  private knows(call: FakeCall): boolean {
    return call.route.startsWith('/files') || call.route === '/audit-events';
  }

  private async answer(call: FakeCall): Promise<unknown> {
    // A turn of the event loop, as the network takes: a refusal a test declares right after the
    // render applies to the request the render made.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const held = this.held.find((each) => each.match(call));

    if (held !== undefined) {
      await held.gate;
    }

    const refusal = this.refusals.findIndex((each) => each.match(call));

    if (refusal !== -1) {
      const [declared] = this.refusals.splice(refusal, 1);
      throw declared?.error;
    }

    return this.route(call);
  }

  private route(call: FakeCall): unknown {
    if (call.route.startsWith('/files/history')) {
      return this.options.history?.answer(this, call) ?? never();
    }

    const routes: Record<string, () => unknown> = {
      'GET /files/tree': () => this.tree(call.query.get('path') ?? ''),
      'GET /files/content': () => this.content(call.query.get('path') ?? ''),
      'POST /files': () => this.create(call.body ?? {}),
      'POST /files/move': () => this.relocate(call.body ?? {}, true),
      'POST /files/copy': () => this.relocate(call.body ?? {}, false),
      'DELETE /files': () => this.delete(call),
      'GET /audit-events': () => this.options.auditEvents?.(call.query) ?? never(),
    };

    return (routes[`${call.method} ${call.route}`] ?? never)();
  }

  private tree(path: string): unknown {
    if (
      path !== '' &&
      this.entries.get(path)?.kind !== 'directory' &&
      this.entries.get(path)?.targetKind !== 'directory'
    ) {
      throw filesRefusal('FILE_NOT_FOUND', 'files.error.notFound', { path });
    }

    return this.listing(path);
  }

  private content(path: string): unknown {
    const entry = this.entries.get(path);

    if (entry?.kind !== 'file') {
      throw filesRefusal('FILE_NOT_FOUND', 'files.error.notFound', { path });
    }

    return { path, content: entry.content ?? '', etag: etagOf(entry.content ?? '') };
  }

  private sensitive(path: string, body: Record<string, unknown>): void {
    if (SENSITIVE.includes(path) && body['confirmSensitive'] !== true) {
      throw filesRefusal('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
        path,
        reason: 'sensitiveFile',
      });
    }
  }

  private create(body: Record<string, unknown>): unknown {
    const path = String(body['path']);

    if (this.entries.has(path)) {
      throw filesRefusal('FILE_EXISTS', 'files.error.exists', { path, currentEtag: null });
    }

    this.sensitive(path, body);

    if (body['kind'] === 'directory') {
      this.put(path, { kind: 'directory' });
      return { path, etag: null };
    }

    const content = typeof body['content'] === 'string' ? body['content'] : '';
    this.put(path, content);
    return { path, etag: etagOf(content) };
  }

  private relocate(body: Record<string, unknown>, move: boolean): unknown {
    const from = String(body['from']);
    const to = String(body['to']);
    const etag = this.checkRelocation(from, to, body);

    for (const [each, value] of [...this.entries.entries()]) {
      if (within(each, from)) {
        this.entries.set(`${to}${each.slice(from.length)}`, { ...value });

        if (move) {
          this.entries.delete(each);
        }
      }
    }

    return { path: to, etag };
  }

  /** The refusals of a move or a copy, as the backend has them; the version of what moves. */
  private checkRelocation(from: string, to: string, body: Record<string, unknown>): string | null {
    const entry = this.entries.get(from);

    if (entry === undefined) {
      throw filesRefusal('FILE_NOT_FOUND', 'files.error.notFound', { path: from });
    }

    if (within(to, from)) {
      throw filesRefusal('FILE_OPERATION_INVALID', 'files.error.operationInvalid', {
        path: from,
        reason: 'intoItself',
      });
    }

    if (this.entries.has(to)) {
      throw filesRefusal('FILE_EXISTS', 'files.error.exists', { path: to, currentEtag: null });
    }

    const etag = entry.kind === 'file' ? etagOf(entry.content ?? '') : null;

    if (typeof body['ifMatch'] === 'string' && body['ifMatch'] !== etag) {
      throw filesRefusal('FILE_CHANGED', 'files.error.changed', { path: from, currentEtag: etag });
    }

    this.sensitive(from, body);
    return etag;
  }

  private delete(call: FakeCall): unknown {
    const path = call.query.get('path') ?? '';
    const entry = this.entries.get(path);

    if (entry === undefined) {
      throw filesRefusal('FILE_NOT_FOUND', 'files.error.notFound', { path });
    }

    const etag = entry.kind === 'file' ? etagOf(entry.content ?? '') : null;
    const ifMatch = call.headers['if-match'];

    if (ifMatch !== undefined && ifMatch !== etag) {
      throw filesRefusal('FILE_CHANGED', 'files.error.changed', { path, currentEtag: etag });
    }

    this.sensitive(path, { confirmSensitive: call.query.get('confirmSensitive') === 'true' });

    if (call.query.get('keepInHistory') === 'true') {
      return this.options.history?.keep(this, path) ?? this.notKept(path);
    }

    this.checkCount(path, call.query);
    this.remove(path);
    return undefined;
  }

  /** A delete kept in the history, with no history to keep it: nothing goes (07 · B-58). */
  private notKept(path: string): never {
    const count = [...this.entries.keys()].filter(
      (each) => each !== path && within(each, path),
    ).length;

    throw this.entries.get(path)?.kind === 'directory'
      ? filesRefusal('DIRECTORY_NOT_EMPTY', 'files.error.directoryNotEmpty', {
          path,
          entryCount: count,
          entryCountCapped: false,
          notKept: 'unavailable',
        })
      : filesRefusal('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
          path,
          reason: 'notKept',
          why: 'unavailable',
        });
  }

  private checkCount(path: string, query: URLSearchParams): void {
    const count = [...this.entries.keys()].filter(
      (each) => each !== path && within(each, path),
    ).length;

    if (count === 0) {
      return;
    }

    if (query.get('recursive') !== 'true') {
      throw filesRefusal('DIRECTORY_NOT_EMPTY', 'files.error.directoryNotEmpty', {
        path,
        entryCount: count,
        entryCountCapped: false,
      });
    }

    if (query.get('expectedEntries') !== String(count)) {
      throw filesRefusal('FILE_CHANGED', 'files.error.changed', { path, currentEtag: null });
    }
  }
}
