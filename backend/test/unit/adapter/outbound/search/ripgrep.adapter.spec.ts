import { describe, expect, it } from 'vitest';

import { RipgrepAdapter } from '@adapter/outbound/search/ripgrep.adapter';
import { ProcessAbortedError } from '@application/search';
import type {
  EngineFileMatches,
  ProcessBudget,
  ProcessCommand,
  ProcessOutcome,
  ProcessRun,
  ProcessRunner,
  RipgrepBinary,
} from '@application/search';
import type { SearchTextOptions } from '@domain/search';
import { SearchEngineFailedError } from '@domain/search';

async function* linesOf(values: readonly (string | Buffer)[]): AsyncIterable<Buffer> {
  for (const value of values) {
    yield typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  }
}

/** A single byte that can never start or continue a valid UTF-8 sequence (S-63). */
const INVALID_UTF8_BYTE = Buffer.from([0xff]);

class FakeProcessRunner implements ProcessRunner {
  lastCommand: ProcessCommand | null = null;

  constructor(
    private readonly lines: readonly (string | Buffer)[],
    private readonly outcome: Promise<ProcessOutcome>,
  ) {}

  run(command: ProcessCommand): ProcessRun {
    this.lastCommand = command;
    return { lines: linesOf(this.lines), outcome: this.outcome };
  }
}

const BINARY: RipgrepBinary = { path: '/usr/bin/rg', version: '15.0.0' };
const BUDGET: ProcessBudget = { timeoutMs: 15_000, maxBytes: 64 * 1024 * 1024 };
const SIGNAL = (): AbortSignal => new AbortController().signal;

function outcomeOf(overrides: Partial<ProcessOutcome> = {}): ProcessOutcome {
  return {
    exitCode: 0,
    durationMs: 5,
    bytesRead: 10,
    truncated: false,
    timedOut: false,
    aborted: false,
    ...overrides,
  };
}

async function drain<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) {
    out.push(item);
  }
  return out;
}

const SEARCH_OPTIONS: SearchTextOptions = {
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  multiline: false,
  contextLines: 0,
  respectDefaultsAndIgnoreFiles: true,
  maxFileBytes: 20_971_520,
  multilineMaxFileBytes: 5_242_880,
};

describe('RipgrepAdapter.listFiles — plan 11, B-09', () => {
  it('decodes each non-empty line as a path, and resolves the outcome', async () => {
    const runner = new FakeProcessRunner(['a.ts', '', 'b.ts'], Promise.resolve(outcomeOf()));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const run = adapter.listFiles(
      '/srv/project',
      { respectDefaultsAndIgnoreFiles: true },
      BUDGET,
      SIGNAL(),
    );

    expect(await drain(run.paths)).toEqual(['a.ts', 'b.ts']);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 0 });
  });

  it('omits a path that cannot be decoded as UTF-8, and counts it in skipped — S-63', async () => {
    const runner = new FakeProcessRunner(
      ['a.ts', INVALID_UTF8_BYTE, 'b.ts'],
      Promise.resolve(outcomeOf()),
    );
    const adapter = new RipgrepAdapter(runner, BINARY);

    const run = adapter.listFiles(
      '/srv/project',
      { respectDefaultsAndIgnoreFiles: true },
      BUDGET,
      SIGNAL(),
    );

    expect(await drain(run.paths)).toEqual(['a.ts', 'b.ts']);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 1 });
  });

  it('counts every non-UTF-8 path, never just the first — S-63', async () => {
    const runner = new FakeProcessRunner(
      [INVALID_UTF8_BYTE, 'a.ts', INVALID_UTF8_BYTE],
      Promise.resolve(outcomeOf()),
    );
    const adapter = new RipgrepAdapter(runner, BINARY);

    const run = adapter.listFiles(
      '/srv/project',
      { respectDefaultsAndIgnoreFiles: true },
      BUDGET,
      SIGNAL(),
    );

    expect(await drain(run.paths)).toEqual(['a.ts']);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 2 });
  });

  it('runs the pinned binary with the folder as cwd, the locate argv and the given budget', () => {
    const runner = new FakeProcessRunner([], Promise.resolve(outcomeOf()));
    const adapter = new RipgrepAdapter(runner, BINARY);

    adapter.listFiles('/srv/project', { respectDefaultsAndIgnoreFiles: true }, BUDGET, SIGNAL());

    expect(runner.lastCommand?.binary).toBe('/usr/bin/rg');
    expect(runner.lastCommand?.cwd).toBe('/srv/project');
    expect(runner.lastCommand?.label).toBe('search.locate');
    expect(runner.lastCommand?.args).toContain('--files');
    expect(runner.lastCommand?.timeoutMs).toBe(BUDGET.timeoutMs);
    expect(runner.lastCommand?.maxBytes).toBe(BUDGET.maxBytes);
  });

  it('wraps a real engine failure as SearchEngineFailedError', async () => {
    const runner = new FakeProcessRunner([], Promise.reject(new Error('ENOENT')));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const run = adapter.listFiles(
      '/srv/project',
      { respectDefaultsAndIgnoreFiles: true },
      BUDGET,
      SIGNAL(),
    );

    await expect(run.outcome).rejects.toBeInstanceOf(SearchEngineFailedError);
  });

  it('never wraps an abort — it passes through as ProcessAbortedError', async () => {
    const original = new ProcessAbortedError();
    const runner = new FakeProcessRunner([], Promise.reject(original));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const run = adapter.listFiles(
      '/srv/project',
      { respectDefaultsAndIgnoreFiles: true },
      BUDGET,
      SIGNAL(),
    );

    await expect(run.outcome).rejects.toBe(original);
  });
});

describe('RipgrepAdapter.searchText — plan 11, B-10', () => {
  it('groups match lines by file, yielding one item per file closed', async () => {
    const lines = [
      '{"type":"begin","data":{"path":{"text":"a.txt"}}}',
      '{"type":"match","data":{"path":{"text":"a.txt"},"lines":{"text":"foo bar\\n"},"line_number":1,"submatches":[{"match":{"text":"foo"},"start":0,"end":3}]}}',
      '{"type":"end","data":{"path":{"text":"a.txt"}}}',
      '{"type":"begin","data":{"path":{"text":"b.txt"}}}',
      '{"type":"match","data":{"path":{"text":"b.txt"},"lines":{"text":"foo baz\\n"},"line_number":5,"submatches":[{"match":{"text":"foo"},"start":0,"end":3}]}}',
      '{"type":"end","data":{"path":{"text":"b.txt"}}}',
      '{"type":"summary","data":{}}',
    ];
    const runner = new FakeProcessRunner(lines, Promise.resolve(outcomeOf()));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const run = adapter.searchText('/srv/project', 'foo', SEARCH_OPTIONS, BUDGET, SIGNAL());
    const files = await drain(run.files);

    expect(files).toEqual<EngineFileMatches[]>([
      {
        path: 'a.txt',
        lines: [
          {
            lineNumber: 1,
            lineText: 'foo bar',
            submatches: [{ startByte: 0, endByte: 3, text: 'foo' }],
          },
        ],
        contextLines: [],
      },
      {
        path: 'b.txt',
        lines: [
          {
            lineNumber: 5,
            lineText: 'foo baz',
            submatches: [{ startByte: 0, endByte: 3, text: 'foo' }],
          },
        ],
        contextLines: [],
      },
    ]);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 0 });
  });

  it('counts a binary file in skipped instead of yielding its matches — S-67', async () => {
    const lines = [
      '{"type":"begin","data":{"path":{"text":"bin.dat"}}}',
      '{"type":"match","data":{"path":{"text":"bin.dat"},"lines":{"text":"foo\\u0000bar\\n"},"line_number":1,"submatches":[{"match":{"text":"foo"},"start":0,"end":3}]}}',
      '{"type":"end","data":{"path":{"text":"bin.dat"},"binary_offset":3}}',
      '{"type":"begin","data":{"path":{"text":"a.txt"}}}',
      '{"type":"match","data":{"path":{"text":"a.txt"},"lines":{"text":"foo\\n"},"line_number":1,"submatches":[{"match":{"text":"foo"},"start":0,"end":3}]}}',
      '{"type":"end","data":{"path":{"text":"a.txt"},"binary_offset":null}}',
    ];
    const runner = new FakeProcessRunner(lines, Promise.resolve(outcomeOf()));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const run = adapter.searchText('/srv/project', 'foo', SEARCH_OPTIONS, BUDGET, SIGNAL());
    const files = await drain(run.files);

    expect(files.map((file) => file.path)).toEqual(['a.txt']);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 1 });
  });

  it('carries context lines of a file apart from its matches', async () => {
    const lines = [
      '{"type":"begin","data":{"path":{"text":"a.txt"}}}',
      '{"type":"context","data":{"path":{"text":"a.txt"},"lines":{"text":"before\\n"},"line_number":1}}',
      '{"type":"match","data":{"path":{"text":"a.txt"},"lines":{"text":"foo\\n"},"line_number":2,"submatches":[{"match":{"text":"foo"},"start":0,"end":3}]}}',
      '{"type":"end","data":{"path":{"text":"a.txt"}}}',
    ];
    const runner = new FakeProcessRunner(lines, Promise.resolve(outcomeOf()));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const [file] = await drain(
      adapter.searchText('/srv/project', 'foo', SEARCH_OPTIONS, BUDGET, SIGNAL()).files,
    );

    expect(file?.contextLines).toEqual([{ lineNumber: 1, lineText: 'before' }]);
  });

  it('skips a file with a begin/end pair and no match in between', async () => {
    const lines = [
      '{"type":"begin","data":{"path":{"text":"a.txt"}}}',
      '{"type":"end","data":{"path":{"text":"a.txt"}}}',
    ];
    const runner = new FakeProcessRunner(lines, Promise.resolve(outcomeOf()));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const files = await drain(
      adapter.searchText('/srv/project', 'foo', SEARCH_OPTIONS, BUDGET, SIGNAL()).files,
    );

    expect(files).toEqual([]);
  });

  it('skips a line it cannot parse, never throwing', async () => {
    const lines = [
      '{"type":"begin","data":{"path":{"text":"a.txt"}}}',
      'not json at all',
      '{"type":"match","data":{"path":{"text":"a.txt"},"lines":{"text":"foo\\n"},"line_number":1,"submatches":[{"match":{"text":"foo"},"start":0,"end":3}]}}',
      '{"type":"end","data":{"path":{"text":"a.txt"}}}',
    ];
    const runner = new FakeProcessRunner(lines, Promise.resolve(outcomeOf()));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const files = await drain(
      adapter.searchText('/srv/project', 'foo', SEARCH_OPTIONS, BUDGET, SIGNAL()).files,
    );

    expect(files).toHaveLength(1);
  });

  it('runs the pinned binary with the search-text argv and the given budget', () => {
    const runner = new FakeProcessRunner([], Promise.resolve(outcomeOf()));
    const adapter = new RipgrepAdapter(runner, BINARY);

    adapter.searchText('/srv/project', 'needle', SEARCH_OPTIONS, BUDGET, SIGNAL());

    expect(runner.lastCommand?.label).toBe('search.text');
    expect(runner.lastCommand?.args).toContain('--regexp=needle');
    expect(runner.lastCommand?.timeoutMs).toBe(BUDGET.timeoutMs);
    expect(runner.lastCommand?.maxBytes).toBe(BUDGET.maxBytes);
  });

  it('wraps a real engine failure as SearchEngineFailedError', async () => {
    const runner = new FakeProcessRunner([], Promise.reject(new Error('crashed')));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const run = adapter.searchText('/srv/project', 'needle', SEARCH_OPTIONS, BUDGET, SIGNAL());

    await expect(run.outcome).rejects.toBeInstanceOf(SearchEngineFailedError);
  });

  it('never wraps an abort — it passes through as ProcessAbortedError', async () => {
    const original = new ProcessAbortedError();
    const runner = new FakeProcessRunner([], Promise.reject(original));
    const adapter = new RipgrepAdapter(runner, BINARY);

    const run = adapter.searchText('/srv/project', 'needle', SEARCH_OPTIONS, BUDGET, SIGNAL());

    await expect(run.outcome).rejects.toBe(original);
  });
});
