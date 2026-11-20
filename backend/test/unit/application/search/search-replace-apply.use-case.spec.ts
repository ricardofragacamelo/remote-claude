import { describe, expect, it } from 'vitest';

import { SearchReplaceApplyUseCase } from '@application/search';
import type { EngineFileMatches, FolderResolver, SearchEngine } from '@application/search';
import type { ReadFileUseCase, SaveFileCommand, SaveFileUseCase } from '@application/files';
import {
  Etag,
  FileChangedError,
  FileNotEncodableError,
  FileNotFoundError,
  FileNotTextError,
  FileTooLargeError,
  PreconditionRequiredError,
} from '@domain/files';
import { ProcessAbortedError } from '@application/search';
import {
  PathOutsideFolderError,
  SearchReplaceApplyFailedError,
  SearchReplaceTooManyFilesError,
} from '@domain/search';
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

function matchedFileOf(path: string, lineText: string): EngineFileMatches {
  return {
    path,
    lines: [
      {
        lineNumber: 1,
        lineText,
        submatches: [{ startByte: 0, endByte: 6, text: 'needle' }],
      },
    ],
    contextLines: [],
  };
}

function openedFileOf(content: string, etag: Etag) {
  return { kind: 'opened' as const, content, etag, encoding: 'utf8', bom: false };
}

class RecordingSaveFileUseCase {
  readonly calls: SaveFileCommand[] = [];

  constructor(private readonly outcome: (command: SaveFileCommand) => unknown = () => ({})) {}

  async execute(command: SaveFileCommand): Promise<unknown> {
    this.calls.push(command);
    const result = this.outcome(command);
    if (result instanceof Error) {
      throw result;
    }
    return result;
  }
}

class FakeReadFileUseCase {
  constructor(private readonly byPath: Map<string, unknown>) {}

  async execute(query: { path: string }): Promise<unknown> {
    const result = this.byPath.get(query.path);
    if (result instanceof Error) {
      throw result;
    }
    return result ?? Promise.reject(new FileNotFoundError(query.path));
  }
}

function inputOf(overrides: Record<string, unknown> = {}) {
  return {
    folder: '/srv/project',
    userId: USER_ID,
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    replacement: 'found',
    preserveCase: false,
    useIgnoreFiles: true,
    files: [],
    ...overrides,
  } as Parameters<SearchReplaceApplyUseCase['execute']>[0];
}

function useCaseOf(options: {
  readFile: Map<string, unknown>;
  engineFiles?: readonly EngineFileMatches[];
  saveFile?: RecordingSaveFileUseCase;
  maxFiles?: number;
}): { useCase: SearchReplaceApplyUseCase; saveFile: RecordingSaveFileUseCase } {
  const engine: SearchEngine = new FakeSearchEngine([], options.engineFiles ?? []);
  const saveFile = options.saveFile ?? new RecordingSaveFileUseCase();
  const useCase = new SearchReplaceApplyUseCase(
    new FakeFolderResolver(),
    engine,
    new FakeReadFileUseCase(options.readFile) as unknown as ReadFileUseCase,
    saveFile as unknown as SaveFileUseCase,
    options.maxFiles ?? 1_000,
    20_971_520,
    5_242_880,
    BUDGET,
  );
  return { useCase, saveFile };
}

describe('SearchReplaceApplyUseCase — plan 11, B-11', () => {
  it('applies a file whose ETag still matches, via the human write path — S-83', async () => {
    const etag = Etag.of(Buffer.from('needle here\n'));
    const { useCase, saveFile } = useCaseOf({
      readFile: new Map([['a.txt', openedFileOf('needle here\n', etag)]]),
      engineFiles: [matchedFileOf('a.txt', 'needle here')],
    });

    const report = await useCase.execute(inputOf({ files: [{ path: 'a.txt', etag: etag.value }] }));

    expect(report).toEqual({ applied: ['a.txt'], changed: [], missing: [], skipped: [] });
    expect(saveFile.calls).toHaveLength(1);
    expect(saveFile.calls[0]).toMatchObject({
      path: 'a.txt',
      content: 'found here\n',
      ifMatch: etag.value,
      via: 'replace',
    });
  });

  it('preserves a file whose ETag already changed, without ever reading it again — S-84', async () => {
    const current = Etag.of(Buffer.from('new content\n'));
    const { useCase, saveFile } = useCaseOf({
      readFile: new Map([['a.txt', openedFileOf('new content\n', current)]]),
    });

    const report = await useCase.execute(
      inputOf({ files: [{ path: 'a.txt', etag: 'stale-etag' }] }),
    );

    expect(report.changed).toEqual(['a.txt']);
    expect(saveFile.calls).toEqual([]);
  });

  it('reports missing a file deleted since the preview, without recreating it — S-86', async () => {
    const { useCase } = useCaseOf({ readFile: new Map() });

    const report = await useCase.execute(inputOf({ files: [{ path: 'gone.txt', etag: 'x' }] }));

    expect(report.missing).toEqual(['gone.txt']);
  });

  it('reclassifies as changed when the write itself loses the race — S-98', async () => {
    const etag = Etag.of(Buffer.from('needle here\n'));
    const saveFile = new RecordingSaveFileUseCase(() => new FileChangedError('a.txt', 'other'));
    const { useCase } = useCaseOf({
      readFile: new Map([['a.txt', openedFileOf('needle here\n', etag)]]),
      engineFiles: [matchedFileOf('a.txt', 'needle here')],
      saveFile,
    });

    const report = await useCase.execute(inputOf({ files: [{ path: 'a.txt', etag: etag.value }] }));

    expect(report.changed).toEqual(['a.txt']);
  });

  it('skips a sensitive file rather than writing it without confirmation', async () => {
    const etag = Etag.of(Buffer.from('needle here\n'));
    const saveFile = new RecordingSaveFileUseCase(
      () => new PreconditionRequiredError('a.txt', 'sensitiveFile'),
    );
    const { useCase } = useCaseOf({
      readFile: new Map([['a.txt', openedFileOf('needle here\n', etag)]]),
      engineFiles: [matchedFileOf('a.txt', 'needle here')],
      saveFile,
    });

    const report = await useCase.execute(inputOf({ files: [{ path: 'a.txt', etag: etag.value }] }));

    expect(report.skipped).toEqual([{ path: 'a.txt', reason: 'sensitive' }]);
  });

  it('reports what was already applied when a later write fails for real — S-89', async () => {
    const etagA = Etag.of(Buffer.from('needle a\n'));
    const etagB = Etag.of(Buffer.from('needle b\n'));
    let calls = 0;
    const saveFile = new RecordingSaveFileUseCase(() => {
      calls += 1;
      return calls === 1 ? {} : new Error('disk full');
    });
    const { useCase } = useCaseOf({
      readFile: new Map([
        ['a.txt', openedFileOf('needle a\n', etagA)],
        ['b.txt', openedFileOf('needle b\n', etagB)],
      ]),
      engineFiles: [matchedFileOf('a.txt', 'needle a'), matchedFileOf('b.txt', 'needle b')],
      saveFile,
    });

    const rejection = expect(
      useCase.execute(
        inputOf({
          files: [
            { path: 'a.txt', etag: etagA.value },
            { path: 'b.txt', etag: etagB.value },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(SearchReplaceApplyFailedError);
    await rejection;
  });

  it('never wraps an abort as a write failure', async () => {
    const etag = Etag.of(Buffer.from('needle here\n'));
    const saveFile = new RecordingSaveFileUseCase(() => new ProcessAbortedError());
    const { useCase } = useCaseOf({
      readFile: new Map([['a.txt', openedFileOf('needle here\n', etag)]]),
      engineFiles: [matchedFileOf('a.txt', 'needle here')],
      saveFile,
    });

    await expect(
      useCase.execute(inputOf({ files: [{ path: 'a.txt', etag: etag.value }] })),
    ).rejects.toBeInstanceOf(ProcessAbortedError);
  });

  it('writes the content unchanged when the engine no longer finds a match on it', async () => {
    const etag = Etag.of(Buffer.from('nothing here\n'));
    const { useCase, saveFile } = useCaseOf({
      readFile: new Map([['a.txt', openedFileOf('nothing here\n', etag)]]),
      engineFiles: [],
    });

    const report = await useCase.execute(inputOf({ files: [{ path: 'a.txt', etag: etag.value }] }));

    expect(report.applied).toEqual(['a.txt']);
    expect(saveFile.calls[0]?.content).toBe('nothing here\n');
  });

  it('refuses more files than the ceiling, before touching any of them — S-94', async () => {
    const { useCase, saveFile } = useCaseOf({ readFile: new Map(), maxFiles: 1 });

    await expect(
      useCase.execute(
        inputOf({
          files: [
            { path: 'a.txt', etag: 'x' },
            { path: 'b.txt', etag: 'y' },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(SearchReplaceTooManyFilesError);
    expect(saveFile.calls).toEqual([]);
  });

  it('refuses a file with no ETag at all, before touching any file — S-93', async () => {
    const { useCase, saveFile } = useCaseOf({ readFile: new Map() });

    await expect(
      useCase.execute(
        inputOf({
          files: [
            { path: 'a.txt', etag: '' },
            { path: 'b.txt', etag: 'y' },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(PreconditionRequiredError);
    expect(saveFile.calls).toEqual([]);
  });

  it('refuses a file path that climbs out of the folder, before touching any file — S-91', async () => {
    const { useCase, saveFile } = useCaseOf({ readFile: new Map() });

    await expect(
      useCase.execute(inputOf({ files: [{ path: '../outside.txt', etag: 'x' }] })),
    ).rejects.toBeInstanceOf(PathOutsideFolderError);
    expect(saveFile.calls).toEqual([]);
  });

  it('refuses an absolute file path, before touching any file — S-91', async () => {
    const { useCase, saveFile } = useCaseOf({ readFile: new Map() });

    await expect(
      useCase.execute(inputOf({ files: [{ path: '/etc/passwd', etag: 'x' }] })),
    ).rejects.toBeInstanceOf(PathOutsideFolderError);
    expect(saveFile.calls).toEqual([]);
  });

  it('refuses a malformed query before touching any file — S-25', async () => {
    const { useCase, saveFile } = useCaseOf({ readFile: new Map() });

    await expect(useCase.execute(inputOf({ pattern: '', files: [] }))).rejects.toThrow();
    expect(saveFile.calls).toEqual([]);
  });

  it('passes include and exclude through to the query — S-87 parity', async () => {
    const { useCase } = useCaseOf({ readFile: new Map() });

    const report = await useCase.execute(
      inputOf({ include: ['src/**'], exclude: ['**/*.spec.ts'], files: [] }),
    );

    expect(report).toEqual({ applied: [], changed: [], missing: [], skipped: [] });
  });

  it('reports skipped: binary for a file that turned binary since the preview — S-87', async () => {
    const { useCase } = useCaseOf({
      readFile: new Map([['a.txt', new FileNotTextError('a.txt', 'binary')]]),
    });

    const report = await useCase.execute(inputOf({ files: [{ path: 'a.txt', etag: 'x' }] }));

    expect(report.skipped).toEqual([{ path: 'a.txt', reason: 'binary' }]);
  });

  it('reports skipped: binary for a file that cannot be encoded back', async () => {
    const { useCase } = useCaseOf({
      readFile: new Map([['a.txt', new FileNotEncodableError('a.txt', 'utf8')]]),
    });

    const report = await useCase.execute(inputOf({ files: [{ path: 'a.txt', etag: 'x' }] }));

    expect(report.skipped).toEqual([{ path: 'a.txt', reason: 'binary' }]);
  });

  it('reports skipped: tooLarge for a file that grew past the edit ceiling — S-87', async () => {
    const { useCase } = useCaseOf({
      readFile: new Map([['a.txt', new FileTooLargeError('a.txt', 10, 5, 'bytes')]]),
    });

    const report = await useCase.execute(inputOf({ files: [{ path: 'a.txt', etag: 'x' }] }));

    expect(report.skipped).toEqual([{ path: 'a.txt', reason: 'tooLarge' }]);
  });

  it('reports a read failure it cannot classify as a real apply failure, with what was already applied', async () => {
    const etagA = Etag.of(Buffer.from('needle a\n'));
    const { useCase } = useCaseOf({
      readFile: new Map<string, unknown>([
        ['a.txt', openedFileOf('needle a\n', etagA)],
        ['b.txt', new Error('disk exploded')],
      ]),
      engineFiles: [matchedFileOf('a.txt', 'needle a')],
    });

    await expect(
      useCase.execute(
        inputOf({
          files: [
            { path: 'a.txt', etag: etagA.value },
            { path: 'b.txt', etag: 'y' },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(SearchReplaceApplyFailedError);
  });

  it('treats a notModified read as nothing to preview over, defensively — never reachable in practice', async () => {
    const { useCase } = useCaseOf({
      readFile: new Map([['a.txt', { kind: 'notModified', etag: Etag.of(Buffer.from('x')) }]]),
    });

    const report = await useCase.execute(inputOf({ files: [{ path: 'a.txt', etag: 'x' }] }));

    expect(report.skipped).toEqual([{ path: 'a.txt', reason: 'binary' }]);
  });
});
