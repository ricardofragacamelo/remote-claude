import { describe, expect, it } from 'vitest';

import { ProcessAbortedError, SearchConcurrencyGate, SearchTextUseCase } from '@application/search';
import type { FolderResolver, SearchTextInput } from '@application/search';
import type { EngineFileMatches, SearchEngine } from '@application/search';
import { SearchEngineFailedError, SearchRateLimitedError } from '@domain/search';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import { FakeSearchEngine } from '../../../support/fakes/fake-search-engine';

class FakeFolderResolver implements FolderResolver {
  async resolve(raw: string): Promise<WorkspacePath> {
    return WorkspacePath.create(raw);
  }
}

const USER_ID = UserId.create('user-1');
const BUDGET = { timeoutMs: 15_000, maxBytes: 64 * 1024 * 1024 };

function inputOf(overrides: Partial<SearchTextInput> = {}): SearchTextInput {
  return {
    folder: '/srv/project',
    userId: USER_ID,
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    useIgnoreFiles: true,
    ...overrides,
  };
}

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

function useCaseOf(
  fileMatches: readonly EngineFileMatches[],
  overrides: {
    outcome?: { truncated: boolean; timedOut: boolean; skipped?: number };
    maxMatches?: number;
    previewContextChars?: number;
    maxConcurrent?: number;
  } = {},
): { useCase: SearchTextUseCase; engine: FakeSearchEngine } {
  const engine = new FakeSearchEngine(
    [],
    fileMatches,
    overrides.outcome === undefined
      ? { truncated: false, timedOut: false, skipped: 0 }
      : { skipped: 0, ...overrides.outcome },
  );
  const concurrency = new SearchConcurrencyGate(overrides.maxConcurrent ?? 2);
  const useCase = new SearchTextUseCase(
    new FakeFolderResolver(),
    engine,
    concurrency,
    overrides.maxMatches ?? 20_000,
    overrides.previewContextChars ?? 250,
    20_971_520,
    5_242_880,
    BUDGET,
  );
  return { useCase, engine };
}

async function drain<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) {
    out.push(item);
  }
  return out;
}

describe('SearchTextUseCase — plan 11, B-10', () => {
  it('streams a match with its UTF-16 column, 1-based — S-64', async () => {
    const { useCase } = useCaseOf([fileOf()]);

    const run = await useCase.execute(inputOf());
    const files = await drain(run.files);

    expect(files).toEqual([
      {
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
    ]);
    await expect(run.outcome).resolves.toEqual({ truncated: null, skipped: 0 });
  });

  it('converts a byte offset past a multibyte character to the right UTF-16 column — S-65', async () => {
    const line = 'wörld foo';
    const byteOffsetOfFoo = Buffer.byteLength('wörld ', 'utf8');
    const { useCase } = useCaseOf([
      fileOf({
        lines: [
          {
            lineNumber: 1,
            lineText: line,
            submatches: [{ startByte: byteOffsetOfFoo, endByte: byteOffsetOfFoo + 3, text: 'foo' }],
          },
        ],
      }),
    ]);

    const [file] = await drain((await useCase.execute(inputOf({ pattern: 'foo' }))).files);

    expect(file?.matches[0]?.column).toBe('wörld '.length + 1);
  });

  it('crops a long line to a preview window — S-66', async () => {
    const line = `${'x'.repeat(2_000)}NEEDLE${'y'.repeat(2_000)}`;
    const { useCase } = useCaseOf(
      [
        fileOf({
          lines: [
            {
              lineNumber: 1,
              lineText: line,
              submatches: [{ startByte: 2_000, endByte: 2_006, text: 'NEEDLE' }],
            },
          ],
        }),
      ],
      { previewContextChars: 10 },
    );

    const [file] = await drain((await useCase.execute(inputOf())).files);

    expect(file?.matches[0]?.preview).toBe(`${'x'.repeat(10)}NEEDLE${'y'.repeat(10)}`);
  });

  it('carries context lines through to the result', async () => {
    const { useCase } = useCaseOf([
      fileOf({ contextLines: [{ lineNumber: 1, lineText: 'before' }] }),
    ]);

    const [file] = await drain((await useCase.execute(inputOf())).files);

    expect(file?.contextLines).toEqual([{ line: 1, text: 'before' }]);
  });

  it('stops at the match-count ceiling, reports it truncated and aborts the engine — S-70', async () => {
    const files = Array.from({ length: 5 }, (_, index) =>
      fileOf({ path: `f${String(index)}.txt` }),
    );
    const { useCase, engine } = useCaseOf(files, { maxMatches: 2 });

    const run = await useCase.execute(inputOf());
    const results = await drain(run.files);

    expect(results.length).toBeLessThan(5);
    await expect(run.outcome).resolves.toEqual({ truncated: { reason: 'limit' }, skipped: 0 });
    expect(engine.searchTextCalls).toHaveLength(1);
  });

  it('reports a timeout distinctly from the match ceiling — S-71', async () => {
    const { useCase } = useCaseOf([fileOf()], { outcome: { truncated: false, timedOut: true } });

    const run = await useCase.execute(inputOf());
    await drain(run.files);

    await expect(run.outcome).resolves.toEqual({ truncated: { reason: 'timeout' }, skipped: 0 });
  });

  it('refuses a third concurrent search from the same user — S-73', async () => {
    const { useCase } = useCaseOf([], { maxConcurrent: 2 });

    await useCase.execute(inputOf());
    await useCase.execute(inputOf());

    await expect(useCase.execute(inputOf())).rejects.toBeInstanceOf(SearchRateLimitedError);
  });

  it('frees its slot once the stream is fully drained, for the next search to use', async () => {
    const { useCase } = useCaseOf([fileOf()], { maxConcurrent: 1 });

    const first = await useCase.execute(inputOf());
    await drain(first.files);
    await first.outcome;

    await expect(useCase.execute(inputOf())).resolves.toBeDefined();
  });

  it('frees its slot even when the engine fails', async () => {
    const failingEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this use case');
      },
      searchText: () => ({
        files: (async function* (): AsyncIterable<EngineFileMatches> {
          // no files — the run fails before any would come
        })(),
        outcome: Promise.reject(new Error('boom')),
      }),
    };
    const failing = new SearchTextUseCase(
      new FakeFolderResolver(),
      failingEngine,
      new SearchConcurrencyGate(1),
      20_000,
      250,
      20_971_520,
      5_242_880,
      BUDGET,
    );

    const run = await failing.execute(inputOf());
    const rejection = expect(run.outcome).rejects.toBeInstanceOf(SearchEngineFailedError);
    await drain(run.files);
    await rejection;

    // The slot freed — proven by a second call being let in at all, not by it succeeding: this
    // engine always fails, so its outcome is drained and asserted on too, never left dangling.
    const second = await failing.execute(inputOf());
    const secondRejection = expect(second.outcome).rejects.toBeInstanceOf(SearchEngineFailedError);
    await drain(second.files);
    await secondRejection;
  });

  it('passes a SearchEngineFailedError from the engine through unwrapped', async () => {
    const original = new SearchEngineFailedError('boom');
    const failingEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this use case');
      },
      searchText: () => ({
        files: (async function* (): AsyncIterable<EngineFileMatches> {
          // no files — the run fails before any would come
        })(),
        outcome: Promise.reject(original),
      }),
    };
    const failing = new SearchTextUseCase(
      new FakeFolderResolver(),
      failingEngine,
      new SearchConcurrencyGate(1),
      20_000,
      250,
      20_971_520,
      5_242_880,
      BUDGET,
    );

    const run = await failing.execute(inputOf());
    const rejection = expect(run.outcome).rejects.toBe(original);
    await drain(run.files);
    await rejection;
  });

  it('reports the match ceiling as truncated even when the engine settles cleanly on its own — the underlying process can exit moments before the ceiling abort reaches it', async () => {
    const racyEngine: SearchEngine = {
      listFiles: () => {
        throw new Error('not used by this use case');
      },
      searchText: () => ({
        files: (async function* (): AsyncIterable<EngineFileMatches> {
          yield fileOf();
        })(),
        outcome: new Promise((resolve) => {
          setTimeout(() => resolve({ truncated: false, timedOut: false, skipped: 0 }), 0);
        }),
      }),
    };
    const useCase = new SearchTextUseCase(
      new FakeFolderResolver(),
      racyEngine,
      new SearchConcurrencyGate(1),
      1,
      250,
      20_971_520,
      5_242_880,
      BUDGET,
    );

    const run = await useCase.execute(inputOf());
    await drain(run.files);

    await expect(run.outcome).resolves.toEqual({ truncated: { reason: 'limit' }, skipped: 0 });
  });

  it('refuses before ever touching the engine when the query is not well-formed — S-25', async () => {
    const { useCase, engine } = useCaseOf([]);

    await expect(useCase.execute(inputOf({ pattern: '' }))).rejects.toThrow();
    expect(engine.searchTextCalls).toHaveLength(0);
  });

  it('propagates an external abort as ProcessAbortedError, never wrapped — S-101', async () => {
    const { useCase } = useCaseOf([fileOf(), fileOf({ path: 'b.txt' })]);
    const controller = new AbortController();

    const run = await useCase.execute(inputOf(), controller.signal);
    const rejection = expect(run.outcome).rejects.toBeInstanceOf(ProcessAbortedError);
    const collecting = drain(run.files);
    controller.abort();

    await collecting;
    await rejection;
  });
});
