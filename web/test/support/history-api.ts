import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import type { RequestOptions } from '@/shared/api/api';
import type { FakeDisk } from './editor-disk';
import { versionOf } from './editor-disk';
import { etagOf, filesRefusal } from './files-api';
import type { FakeCall, FakeFolder, FakeFolderHistory } from './files-api';

/** The person the specs sign in as, and somebody else who reaches the same folder (D-17). */
export const ME = 'auth0|me-0001';
export const SOMEONE = 'f3c9a1d7-5e2b-4c8a-9d10-aa11bb22cc33';

/** One entry of the fake history, as `GET /files/history` lists it. */
export interface FakeHistoryEntry {
  readonly id: string;
  readonly path: string;
  readonly entryKind: 'file' | 'directory';
  readonly reason: 'save' | 'delete' | 'restore' | 'upload';
  readonly kept: 'yes' | 'tooLarge';
  readonly sizeBytes: number;
  readonly hash: string | null;
  readonly author: { readonly self: boolean; readonly id: string };
  readonly at: string;
  readonly batchId: string | null;
}

/** What a seeded version may say besides its path and content. */
export interface VersionSeed {
  readonly reason?: FakeHistoryEntry['reason'];
  readonly at?: string;
  readonly author?: string;
  readonly kept?: FakeHistoryEntry['kept'];
  readonly entryKind?: FakeHistoryEntry['entryKind'];
  readonly batchId?: string | null;
}

/** The disk a history restores onto — the Explorer's fake folder, or the editor's fake disk. */
interface HistoryDisk {
  read(path: string): string | undefined;
  exists(path: string): boolean;
  etag(path: string): string | null;
  write(path: string, content: string): void;
  makeDirectory(path: string): void;
  remove(path: string): void;
  paths(): readonly string[];
  isDirectory(path: string): boolean;
}

function folderDisk(folder: FakeFolder): HistoryDisk {
  return {
    read: (path) => folder.entries.get(path)?.content,
    exists: (path) => folder.entries.has(path),
    etag: (path) => {
      const entry = folder.entries.get(path);
      return entry?.kind === 'file' ? etagOf(entry.content ?? '') : null;
    },
    write: (path, content) => {
      folder.put(path, content);
    },
    makeDirectory: (path) => {
      folder.put(path, { kind: 'directory' });
    },
    remove: (path) => {
      folder.remove(path);
    },
    paths: () => [...folder.entries.keys()],
    isDirectory: (path) => folder.entries.get(path)?.kind === 'directory',
  };
}

function editorDisk(disk: FakeDisk): HistoryDisk {
  return {
    read: (path) => disk.files.get(path)?.content,
    exists: (path) => disk.files.has(path),
    etag: (path) => disk.versionOf(path),
    write: (path, content) => {
      disk.write(path, content);
    },
    makeDirectory: () => undefined,
    remove: (path) => {
      disk.remove(path);
    },
    paths: () => [...disk.files.keys()],
    isDirectory: () => false,
  };
}

/** The paths that change what Claude may do (07 · D-15). */
const SENSITIVE = ['.claude/settings.json', '.claude/settings.local.json', '.mcp.json'];

function within(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/**
 * The local history of a folder as the backend answers it (07 · F8, backend/03 `files`): the
 * versions of a path, newest first and paged by cursor, the recently deleted, the content of a
 * version, restoring one — with `If-Match` (`412`), without it (`409` on a taken path) — and the
 * delete with `keepInHistory`. Every version a test seeds or a write leaves is kept in memory.
 */
export class FakeHistory implements FakeFolderHistory {
  readonly entries: FakeHistoryEntry[] = [];
  readonly contents = new Map<string, string>();
  readonly calls: FakeCall[] = [];

  /** What a delete kept in the history does not fit: answered as not kept, by path. */
  readonly tooLarge = new Set<string>();
  private next = 0;
  private clock = Date.parse('2026-10-01T10:00:00.000Z');
  private disk: HistoryDisk | null = null;

  /** Seeds a version of `path` — the newest so far, unless `at` says otherwise. */
  version(path: string, content: string, seed: VersionSeed = {}): FakeHistoryEntry {
    this.next += 1;
    this.clock += 60_000;
    const given: Required<VersionSeed> = {
      reason: 'save',
      at: new Date(this.clock).toISOString(),
      author: ME,
      kept: 'yes',
      entryKind: 'file',
      batchId: null,
      ...seed,
    };
    const entry: FakeHistoryEntry = {
      id: `h-${String(this.next)}`,
      path,
      entryKind: given.entryKind,
      reason: given.reason,
      kept: given.kept,
      sizeBytes: content.length,
      hash: given.kept === 'tooLarge' ? null : `sha-${String(this.next)}`,
      author: { self: given.author === ME, id: given.author },
      at: given.at,
      batchId: given.batchId,
    };

    this.entries.push(entry);
    if (entry.kept === 'yes') {
      this.contents.set(entry.id, content);
    }

    return entry;
  }

  keep(folder: FakeFolder, path: string): unknown {
    this.disk = folderDisk(folder);
    return this.keepOn(this.disk, path);
  }

  answer(folder: FakeFolder, call: FakeCall): unknown {
    this.disk = folderDisk(folder);
    return this.route(call);
  }

  /**
   * Stands the history in for the HTTP client over the editor's fake disk, for the routes it knows
   * — `/files/history…` and `/files/limits` —; anything else goes to the fake installed before.
   */
  installOver(
    disk: FakeDisk,
    limits: Record<string, number> | null = { historyMaxFileBytes: 2_097_152 },
  ) {
    this.disk = editorDisk(disk);
    const before = {
      get: vi.isMockFunction(api.get) ? vi.mocked(api.get).getMockImplementation() : undefined,
      post: vi.isMockFunction(api.post) ? vi.mocked(api.post).getMockImplementation() : undefined,
    };
    const callOf = (
      method: FakeCall['method'],
      path: string,
      body: unknown,
      options?: RequestOptions,
    ) => {
      const [route = '', search = ''] = path.split('?');
      return {
        method,
        route,
        query: new URLSearchParams(search),
        body: body as Record<string, unknown> | undefined,
        headers: options?.headers ?? {},
      };
    };

    vi.spyOn(api, 'get').mockImplementation(async (path: string, options?: RequestOptions) => {
      if (path === '/files/limits') {
        return (limits ?? new Promise(() => undefined)) as never;
      }

      if (!path.startsWith('/files/history')) {
        return (before.get?.(path, options) ?? new Promise(() => undefined)) as never;
      }

      await Promise.resolve();
      return this.route(callOf('GET', path, undefined, options)) as never;
    });
    vi.spyOn(api, 'post').mockImplementation(
      async (path: string, body: unknown, options?: RequestOptions) => {
        if (!path.startsWith('/files/history')) {
          return (before.post?.(path, body, options) ?? new Promise(() => undefined)) as never;
        }

        await Promise.resolve();
        return this.route(callOf('POST', path, body, options)) as never;
      },
    );
    return this;
  }

  /** The calls of one kind: `GET` lists, `POST` restores. */
  callsOf(method: FakeCall['method']): FakeCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  private route(call: FakeCall): unknown {
    this.calls.push(call);
    const [, , , id, action] = call.route.split('/');

    if (id === undefined) {
      return call.query.get('deleted') === 'true'
        ? this.deleted(call.query)
        : this.list(call.query);
    }

    return action === 'restore' ? this.restore(id, call) : this.content(id);
  }

  private disked(): HistoryDisk {
    if (this.disk === null) {
      throw new Error('the fake history has no disk');
    }

    return this.disk;
  }

  private page(entries: readonly FakeHistoryEntry[], query: URLSearchParams) {
    const newest = [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const start = Number(query.get('cursor') ?? 0);
    const limit = Number(query.get('limit') ?? 20);
    const end = start + limit;

    return {
      entries: newest.slice(start, end),
      nextCursor: end < newest.length ? String(end) : null,
    };
  }

  private list(query: URLSearchParams): unknown {
    const path = query.get('path');
    const reason = query.get('reason');

    return this.page(
      this.entries.filter(
        (entry) => entry.path === path && (reason === null || entry.reason === reason),
      ),
      query,
    );
  }

  private deleted(query: URLSearchParams): unknown {
    const disk = this.disked();
    const last = new Map<string, FakeHistoryEntry>();

    for (const entry of this.entries) {
      const known = last.get(entry.path);

      if (entry.reason === 'delete' && (known === undefined || known.at <= entry.at)) {
        last.set(entry.path, entry);
      }
    }

    return this.page(
      [...last.values()].filter((entry) => !disk.exists(entry.path)),
      query,
    );
  }

  private entryOf(id: string): FakeHistoryEntry {
    const entry = this.entries.find((each) => each.id === id);

    if (entry === undefined) {
      throw filesRefusal('HISTORY_ENTRY_NOT_FOUND', 'files.error.historyEntryNotFound', {
        entryId: id,
      });
    }

    return entry;
  }

  private content(id: string): unknown {
    const entry = this.entryOf(id);
    const content = this.contents.get(id) ?? '';

    return {
      path: entry.path,
      content,
      etag: versionOf(content),
      encoding: 'utf8',
      bom: false,
      eol: 'lf',
      size: content.length,
      mtime: entry.at,
      largeFile: false,
    };
  }

  /** The refusals of a restore, as the backend has them: `409`, `412`, `428`. */
  private checkRestore(disk: HistoryDisk, entry: FakeHistoryEntry, call: FakeCall): void {
    const ifMatch = call.headers['if-match'];

    if (ifMatch === undefined && disk.exists(entry.path)) {
      throw filesRefusal('FILE_EXISTS', 'files.error.exists', {
        path: entry.path,
        currentEtag: disk.etag(entry.path),
      });
    }

    if (ifMatch !== undefined && ifMatch !== disk.etag(entry.path)) {
      throw filesRefusal('FILE_CHANGED', 'files.error.changed', {
        path: entry.path,
        currentEtag: disk.etag(entry.path),
      });
    }

    if (SENSITIVE.includes(entry.path) && call.body?.['confirmSensitive'] !== true) {
      throw filesRefusal('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
        path: entry.path,
        reason: 'sensitiveFile',
      });
    }
  }

  private restore(id: string, call: FakeCall): unknown {
    const disk = this.disked();
    const entry = this.entryOf(id);
    this.checkRestore(disk, entry, call);

    if (entry.entryKind === 'directory') {
      disk.makeDirectory(entry.path);
      return { path: entry.path, etag: null, size: 0, written: true, history: null };
    }

    const before = disk.read(entry.path);

    if (before !== undefined) {
      this.version(entry.path, before, { reason: 'restore' });
    }

    const content = this.contents.get(id) ?? '';
    disk.write(entry.path, content);
    return {
      path: entry.path,
      etag: disk.etag(entry.path),
      size: content.length,
      written: true,
      history: null,
    };
  }

  private keepOn(disk: HistoryDisk, path: string): unknown {
    if (this.tooLarge.has(path)) {
      throw disk.isDirectory(path)
        ? filesRefusal('DIRECTORY_NOT_EMPTY', 'files.error.directoryNotEmpty', {
            path,
            entryCount: disk.paths().filter((each) => each !== path && within(each, path)).length,
            entryCountCapped: false,
            notKept: 'tooLarge',
          })
        : filesRefusal('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
            path,
            reason: 'notKept',
            why: 'tooLarge',
          });
    }

    const batchId = `batch-${String(this.next + 1)}`;
    const kept = disk
      .paths()
      .filter((each) => within(each, path))
      .map((each) =>
        this.version(each, disk.read(each) ?? '', {
          reason: 'delete',
          batchId,
          entryKind: disk.isDirectory(each) ? 'directory' : 'file',
        }),
      );

    disk.remove(path);
    return {
      kept: {
        batchId,
        entries: kept.map((entry) => ({
          id: entry.id,
          path: entry.path,
          entryKind: entry.entryKind,
        })),
      },
    };
  }
}
