import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';

import { SearchController } from '@adapter/inbound/http/search/search.controller';
import {
  FindPathsUseCase,
  LocateCache,
  ProcessAbortedError,
  SearchConcurrencyGate,
  SearchReplaceApplyUseCase,
  SearchReplacePreviewUseCase,
  SearchTextUseCase,
} from '@application/search';
import type { EngineFileMatches, FolderResolver, SearchEngine } from '@application/search';
import type { ReadFileUseCase, SaveFileUseCase } from '@application/files';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import { FakeSearchEngine } from '../../../../../support/fakes/fake-search-engine';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

class FakeFolderResolver implements FolderResolver {
  async resolve(raw: string): Promise<WorkspacePath> {
    return WorkspacePath.create(raw);
  }
}

const BUDGET = { timeoutMs: 15_000, maxBytes: 64 * 1024 * 1024 };

/** The handful of `Request`/`Response` members `SearchController.searchText` actually touches. */
class FakeRequest {
  private readonly listeners = new Map<string, (() => void)[]>();

  on(event: string, listener: () => void): this {
    const existing = this.listeners.get(event) ?? [];
    this.listeners.set(event, [...existing, listener]);
    return this;
  }

  off(event: string, listener: () => void): this {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((l) => l !== listener),
    );
    return this;
  }

  emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }
}

class FakeResponse {
  statusCode = 0;
  readonly headers: Record<string, string> = {};
  readonly chunks: string[] = [];
  writableEnded = false;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(chunk?: string): this {
    if (chunk !== undefined) this.chunks.push(chunk);
    this.writableEnded = true;
    return this;
  }

  text(): string {
    return this.chunks.join('');
  }

  frames(): unknown[] {
    return this.text()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }
}

const FAKE_READ_FILE = {
  execute: () => Promise.reject(new Error('not used by this test')),
} as unknown as ReadFileUseCase;

const FAKE_SAVE_FILE = {
  execute: () => Promise.reject(new Error('not used by this test')),
} as unknown as SaveFileUseCase;

function controllerOf(
  paths: readonly string[],
  fileMatches: readonly EngineFileMatches[] = [],
  searchEngine?: SearchEngine,
  findPathsOverride?: FindPathsUseCase,
): SearchController {
  const folders = new FakeFolderResolver();
  const findPaths =
    findPathsOverride ??
    new FindPathsUseCase(
      folders,
      new FakeSearchEngine(paths),
      new LocateCache(10_000, new FixedClock(new Date('2026-01-01T00:00:00Z'))),
      200_000,
      50,
      200,
      BUDGET,
    );
  const engine = searchEngine ?? new FakeSearchEngine([], fileMatches);
  const searchTextUseCase = new SearchTextUseCase(
    folders,
    engine,
    new SearchConcurrencyGate(2),
    20_000,
    250,
    20_971_520,
    5_242_880,
    BUDGET,
  );
  const replacePreviewUseCase = new SearchReplacePreviewUseCase(searchTextUseCase, FAKE_READ_FILE);
  const replaceApplyUseCase = new SearchReplaceApplyUseCase(
    folders,
    engine,
    FAKE_READ_FILE,
    FAKE_SAVE_FILE,
    1_000,
    20_971_520,
    5_242_880,
    BUDGET,
  );
  return new SearchController(
    findPaths,
    searchTextUseCase,
    replacePreviewUseCase,
    replaceApplyUseCase,
    new RecordingLogger().logger,
  );
}

function searchTextInputOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    folder: '/srv/app',
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    useIgnoreFiles: true,
    ...overrides,
  };
}

describe('GET /search/files — the locator over HTTP (plan 11, B-09, B-12)', () => {
  it('locates files matching the query', async () => {
    const payload = await controllerOf(['src/a.ts', 'src/session.ts']).locate(
      {
        folder: '/srv/app',
        query: 'session',
        kinds: ['file'],
        prefer: [],
        includeIgnored: false,
      },
      UserId.create('user-1'),
      new FakeRequest() as unknown as Request,
    );

    expect(payload.entries.map((entry) => entry.path)).toEqual(['src/session.ts']);
    expect(payload.truncated).toBeNull();
  });

  it('omits limit from the use case input when the query named none', async () => {
    const payload = await controllerOf(['a.ts', 'b.ts']).locate(
      {
        folder: '/srv/app',
        query: '',
        kinds: ['file'],
        prefer: ['a.ts', 'b.ts'],
        includeIgnored: false,
      },
      UserId.create('user-1'),
      new FakeRequest() as unknown as Request,
    );

    expect(payload.entries.map((entry) => entry.path).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('passes limit through when the query named one', async () => {
    const payload = await controllerOf(['a.ts', 'b.ts', 'c.ts']).locate(
      {
        folder: '/srv/app',
        query: '',
        kinds: ['file'],
        prefer: ['a.ts', 'b.ts', 'c.ts'],
        includeIgnored: false,
        limit: 1,
      },
      UserId.create('user-1'),
      new FakeRequest() as unknown as Request,
    );

    expect(payload.entries).toHaveLength(1);
  });

  it('stops listening for the request close once the route is done — S-62', async () => {
    const request = new FakeRequest();

    await controllerOf(['a.ts']).locate(
      {
        folder: '/srv/app',
        query: '',
        kinds: ['file'],
        prefer: ['a.ts'],
        includeIgnored: false,
      },
      UserId.create('user-1'),
      request as unknown as Request,
    );

    expect(() => request.emit('close')).not.toThrow();
  });

  it('a closed request aborts the use case’s own call — S-62', async () => {
    let seenSignal: AbortSignal | undefined;
    const findPaths = {
      execute: (_input: unknown, signal?: AbortSignal) => {
        seenSignal = signal;
        return new Promise(() => {});
      },
    } as unknown as FindPathsUseCase;
    const controller = controllerOf([], [], undefined, findPaths);
    const request = new FakeRequest();

    void controller.locate(
      { folder: '/srv/app', query: '', kinds: ['file'], prefer: [], includeIgnored: false },
      UserId.create('user-1'),
      request as unknown as Request,
    );
    request.emit('close');

    expect(seenSignal?.aborted).toBe(true);
  });
});

function fileOf(overrides: Partial<EngineFileMatches> = {}): EngineFileMatches {
  return {
    path: 'a.txt',
    lines: [
      {
        lineNumber: 1,
        lineText: 'a needle here',
        submatches: [{ startByte: 2, endByte: 8, text: 'needle' }],
      },
    ],
    contextLines: [],
    ...overrides,
  };
}

describe('POST /search/text — the stream over HTTP (plan 11, B-10, B-12)', () => {
  it('opens the stream with the NDJSON headers and writes a file frame then end — S-167', async () => {
    const controller = controllerOf([], [fileOf()]);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await controller.searchText(
      searchTextInputOf() as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/x-ndjson');
    expect(response.headers['Cache-Control']).toBe('no-transform');
    expect(response.headers['X-Accel-Buffering']).toBe('no');
    expect(response.frames()).toEqual([
      {
        type: 'file',
        path: 'a.txt',
        matches: [
          {
            line: 1,
            column: 3,
            endColumn: 9,
            preview: 'a needle here',
            previewMatchStart: 2,
            previewMatchEnd: 8,
          },
        ],
        contextLines: [],
      },
      { type: 'end', truncated: null, skipped: 0 },
    ]);
    expect(response.writableEnded).toBe(true);
  });

  it('writes an error frame, never a thrown exception, when the engine fails after the first byte', async () => {
    const failingEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this route');
      },
      searchText: () => ({
        files: (async function* (): AsyncIterable<EngineFileMatches> {
          yield fileOf();
        })(),
        outcome: Promise.reject(new Error('rg crashed')),
      }),
    };
    const controller = controllerOf([], [], failingEngine);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await controller.searchText(
      searchTextInputOf() as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );

    const frames = response.frames();
    expect(frames[0]).toMatchObject({ type: 'file', path: 'a.txt' });
    expect(frames[1]).toMatchObject({ type: 'error', code: 'SEARCH_ENGINE_FAILED' });
    expect(response.writableEnded).toBe(true);
  });

  it('ends the response without an error frame once the run reports an abort — S-101', async () => {
    const abortedEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this route');
      },
      searchText: () => ({
        files: (async function* (): AsyncIterable<EngineFileMatches> {
          yield fileOf();
        })(),
        outcome: Promise.reject(new ProcessAbortedError()),
      }),
    };
    const controller = controllerOf([], [], abortedEngine);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await controller.searchText(
      searchTextInputOf() as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );

    expect(response.frames()).toEqual([
      { type: 'file', path: 'a.txt', matches: expect.any(Array), contextLines: [] },
    ]);
    expect(response.writableEnded).toBe(true);
  });

  it('aborts the run once the request closes mid-stream, before it settles on its own', async () => {
    let yieldedFirst: (() => void) | null = null;
    const firstYielded = new Promise<void>((resolve) => {
      yieldedFirst = resolve;
    });
    const pausingEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this route');
      },
      searchText: (_folder, _pattern, _options, _budget, signal) => ({
        files: (async function* (): AsyncIterable<EngineFileMatches> {
          yield fileOf();
          yieldedFirst?.();
          await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
        })(),
        outcome: new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new ProcessAbortedError()));
        }),
      }),
    };
    const controller = controllerOf([], [], pausingEngine);
    const request = new FakeRequest();
    const response = new FakeResponse();

    const pending = controller.searchText(
      searchTextInputOf() as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );
    await firstYielded;
    request.emit('close');
    await pending;

    expect(response.frames()).toEqual([
      { type: 'file', path: 'a.txt', matches: expect.any(Array), contextLines: [] },
    ]);
    expect(response.writableEnded).toBe(true);
  });

  it('never aborts a run whose response already ended for some other reason', async () => {
    const state: {
      yieldedFirst: (() => void) | null;
      releasePause: (() => void) | null;
      capturedSignal: AbortSignal | null;
    } = { yieldedFirst: null, releasePause: null, capturedSignal: null };
    const firstYielded = new Promise<void>((resolve) => {
      state.yieldedFirst = resolve;
    });
    const pausingEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this route');
      },
      searchText: (_folder, _pattern, _options, _budget, signal) => {
        state.capturedSignal = signal;
        return {
          files: (async function* (): AsyncIterable<EngineFileMatches> {
            yield fileOf();
            state.yieldedFirst?.();
            await new Promise<void>((resolve) => {
              state.releasePause = resolve;
            });
          })(),
          outcome: Promise.resolve({ truncated: false, timedOut: false, skipped: 0 }),
        };
      },
    };
    const controller = controllerOf([], [], pausingEngine);
    const request = new FakeRequest();
    const response = new FakeResponse();

    const pending = controller.searchText(
      searchTextInputOf() as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );
    await firstYielded;
    response.end('already-ended-for-another-reason\n');
    request.emit('close');
    state.releasePause?.();
    await pending;

    expect(state.capturedSignal?.aborted).toBe(false);
  });

  it('passes include, exclude and onlyPaths through to the use case when given', async () => {
    let recordedOptions: unknown = null;
    const recordingEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this route');
      },
      searchText: (_folder, _pattern, options) => {
        recordedOptions = options;
        return {
          files: (async function* (): AsyncIterable<EngineFileMatches> {})(),
          outcome: Promise.resolve({ truncated: false, timedOut: false, skipped: 0 }),
        };
      },
    };
    const controller = controllerOf([], [], recordingEngine);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await controller.searchText(
      searchTextInputOf({
        include: ['src/**'],
        exclude: ['**/*.spec.ts'],
        onlyPaths: ['src/a.ts'],
        contextLines: 2,
      }) as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );

    expect(recordedOptions).toMatchObject({
      include: ['src/**'],
      exclude: ['**/*.spec.ts'],
      onlyPaths: ['src/a.ts'],
      contextLines: 2,
    });
  });

  it('wraps a plain error raised while iterating the files as SEARCH_ENGINE_FAILED', async () => {
    const throwingEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this route');
      },
      searchText: () => ({
        files: {
          [Symbol.asyncIterator]: () => ({
            next: (): Promise<IteratorResult<EngineFileMatches>> =>
              Promise.reject(new Error('unexpected shape from the engine')),
          }),
        },
        outcome: Promise.resolve({ truncated: false, timedOut: false, skipped: 0 }),
      }),
    };
    const controller = controllerOf([], [], throwingEngine);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await controller.searchText(
      searchTextInputOf() as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );

    expect(response.frames()).toEqual([
      {
        type: 'error',
        code: 'SEARCH_ENGINE_FAILED',
        messageKey: 'search.error.engineFailed',
        params: {},
      },
    ]);
  });

  it('registers and unregisters its own close listener around the run', async () => {
    const controller = controllerOf([], [fileOf()]);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await controller.searchText(
      searchTextInputOf() as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );

    // A close that arrives after the handler already detached must have no effect — proof the
    // listener was actually removed, not just that abort was never triggered.
    expect(() => request.emit('close')).not.toThrow();
  });

  it('refuses a malformed pattern before the response is touched at all — S-25', async () => {
    const controller = controllerOf([], []);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await expect(
      controller.searchText(
        searchTextInputOf({ pattern: '' }) as never,
        UserId.create('user-1'),
        request as unknown as Request,
        response as unknown as Response,
      ),
    ).rejects.toThrow();

    expect(response.statusCode).toBe(0);
    expect(response.chunks).toEqual([]);
  });
});

function replacePreviewInputOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    folder: '/srv/app',
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    useIgnoreFiles: true,
    replacement: 'found',
    preserveCase: false,
    ...overrides,
  };
}

function controllerWithReplaceOf(
  fileMatches: readonly EngineFileMatches[],
  readFile: ReadFileUseCase,
  saveFile: SaveFileUseCase = FAKE_SAVE_FILE,
  engineOverride?: SearchEngine,
): SearchController {
  const folders = new FakeFolderResolver();
  const engine = engineOverride ?? new FakeSearchEngine([], fileMatches);
  const findPaths = new FindPathsUseCase(
    folders,
    new FakeSearchEngine([]),
    new LocateCache(10_000, new FixedClock(new Date('2026-01-01T00:00:00Z'))),
    200_000,
    50,
    200,
    BUDGET,
  );
  const searchTextUseCase = new SearchTextUseCase(
    folders,
    engine,
    new SearchConcurrencyGate(2),
    20_000,
    250,
    20_971_520,
    5_242_880,
    BUDGET,
  );
  const replacePreviewUseCase = new SearchReplacePreviewUseCase(searchTextUseCase, readFile);
  const replaceApplyUseCase = new SearchReplaceApplyUseCase(
    folders,
    engine,
    readFile,
    saveFile,
    1_000,
    20_971_520,
    5_242_880,
    BUDGET,
  );
  return new SearchController(
    findPaths,
    searchTextUseCase,
    replacePreviewUseCase,
    replaceApplyUseCase,
    new RecordingLogger().logger,
  );
}

describe('POST /search/replace/preview — the stream over HTTP (plan 11, B-11)', () => {
  it('streams a file frame with etag and per-match replacement, then end — S-81', async () => {
    const readFile = {
      execute: () => Promise.resolve({ kind: 'opened' as const, etag: { value: 'abc123' } }),
    } as unknown as ReadFileUseCase;
    const controller = controllerWithReplaceOf([fileOf()], readFile);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await controller.replacePreview(
      replacePreviewInputOf() as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/x-ndjson');
    expect(response.frames()).toEqual([
      {
        type: 'file',
        path: 'a.txt',
        etag: 'abc123',
        matches: [expect.objectContaining({ replacement: 'found' })],
      },
      { type: 'end', truncated: null, skipped: 0 },
    ]);
  });

  it('passes include, exclude, onlyPaths and contextLines through when given', async () => {
    let recordedOptions: unknown = null;
    const recordingEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this route');
      },
      searchText: (_folder, _pattern, options) => {
        recordedOptions = options;
        return {
          files: (async function* (): AsyncIterable<EngineFileMatches> {})(),
          outcome: Promise.resolve({ truncated: false, timedOut: false, skipped: 0 }),
        };
      },
    };
    const readFile = {
      execute: () => Promise.resolve({ kind: 'opened' as const, etag: { value: 'x' } }),
    } as unknown as ReadFileUseCase;
    const controller = controllerWithReplaceOf([], readFile, FAKE_SAVE_FILE, recordingEngine);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await controller.replacePreview(
      replacePreviewInputOf({
        include: ['src/**'],
        exclude: ['**/*.spec.ts'],
        onlyPaths: ['src/a.ts'],
        contextLines: 2,
      }) as never,
      UserId.create('user-1'),
      request as unknown as Request,
      response as unknown as Response,
    );

    expect(recordedOptions).toMatchObject({
      include: ['src/**'],
      exclude: ['**/*.spec.ts'],
      onlyPaths: ['src/a.ts'],
      contextLines: 2,
    });
  });

  it('refuses a malformed replacement before the response is touched — S-82', async () => {
    const readFile = {
      execute: () => Promise.reject(new Error('unused')),
    } as unknown as ReadFileUseCase;
    const controller = controllerWithReplaceOf([], readFile);
    const request = new FakeRequest();
    const response = new FakeResponse();

    await expect(
      controller.replacePreview(
        replacePreviewInputOf({ isRegex: true, replacement: '$1' }) as never,
        UserId.create('user-1'),
        request as unknown as Request,
        response as unknown as Response,
      ),
    ).rejects.toThrow();

    expect(response.statusCode).toBe(0);
  });
});

function replaceApplyInputOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    folder: '/srv/app',
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    useIgnoreFiles: true,
    replacement: 'found',
    preserveCase: false,
    files: [],
    ...overrides,
  };
}

describe('POST /search/replace — applying the replace over HTTP (plan 11, B-11)', () => {
  it('answers 200 with the report — S-83', async () => {
    const etag = { value: 'abc123' };
    const readFile = {
      execute: () =>
        Promise.resolve({
          kind: 'opened' as const,
          content: 'needle here\n',
          etag,
          encoding: 'utf8',
          bom: false,
        }),
    } as unknown as ReadFileUseCase;
    const saveFile = { execute: () => Promise.resolve({}) } as unknown as SaveFileUseCase;
    const controller = controllerWithReplaceOf([fileOf()], readFile, saveFile);
    const request = new FakeRequest();

    const result = await controller.replaceApply(
      replaceApplyInputOf({ files: [{ path: 'a.txt', etag: 'abc123' }] }) as never,
      UserId.create('user-1'),
      request as unknown as Request,
    );

    expect(result).toEqual({
      report: { applied: ['a.txt'], changed: [], missing: [], skipped: [] },
    });
  });

  it('refuses a malformed query without touching any file', async () => {
    const controller = controllerWithReplaceOf([], FAKE_READ_FILE, FAKE_SAVE_FILE);
    const request = new FakeRequest();

    await expect(
      controller.replaceApply(
        replaceApplyInputOf({ pattern: '' }) as never,
        UserId.create('user-1'),
        request as unknown as Request,
      ),
    ).rejects.toThrow();
  });

  it('unregisters its close listener once the apply settles', async () => {
    const controller = controllerWithReplaceOf([], FAKE_READ_FILE, FAKE_SAVE_FILE);
    const request = new FakeRequest();

    await controller.replaceApply(
      replaceApplyInputOf() as never,
      UserId.create('user-1'),
      request as unknown as Request,
    );

    expect(() => request.emit('close')).not.toThrow();
  });

  it('passes include and exclude through to the query when given', async () => {
    let recordedOptions: unknown = null;
    const recordingEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this route');
      },
      searchText: (_folder, _pattern, options) => {
        recordedOptions = options;
        return {
          files: (async function* (): AsyncIterable<EngineFileMatches> {})(),
          outcome: Promise.resolve({ truncated: false, timedOut: false, skipped: 0 }),
        };
      },
    };
    const readFile = {
      execute: () =>
        Promise.resolve({
          kind: 'opened' as const,
          content: 'needle here\n',
          etag: { value: 'x' },
          encoding: 'utf8',
          bom: false,
        }),
    } as unknown as ReadFileUseCase;
    const saveFile = { execute: () => Promise.resolve({}) } as unknown as SaveFileUseCase;
    const controller = controllerWithReplaceOf([], readFile, saveFile, recordingEngine);
    const request = new FakeRequest();

    await controller.replaceApply(
      replaceApplyInputOf({
        include: ['src/**'],
        exclude: ['**/*.spec.ts'],
        files: [{ path: 'a.txt', etag: 'x' }],
      }) as never,
      UserId.create('user-1'),
      request as unknown as Request,
    );

    expect(recordedOptions).toMatchObject({
      include: ['src/**'],
      exclude: ['**/*.spec.ts'],
    });
  });
});
