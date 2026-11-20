import { describe, expect, it } from 'vitest';

import {
  SearchConcurrencyGate,
  SearchReplacePreviewUseCase,
  SearchTextUseCase,
} from '@application/search';
import type { ReadFileQuery, ReadFileUseCase } from '@application/files';
import type { EngineFileMatches, FolderResolver } from '@application/search';
import {
  Etag,
  FileNotEncodableError,
  FileNotFoundError,
  FileNotTextError,
  FileTooLargeError,
} from '@domain/files';
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

async function drain<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) {
    out.push(item);
  }
  return out;
}

interface FakeReadFileUseCase {
  execute(query: ReadFileQuery, userId: UserId): Promise<{ kind: 'opened'; etag: Etag } | never>;
}

function readFileThatThrows(error: Error): FakeReadFileUseCase {
  return {
    execute: () => Promise.reject(error),
  };
}

function readFileWithEtag(etag: Etag): FakeReadFileUseCase {
  return {
    execute: () => Promise.resolve({ kind: 'opened', etag }),
  };
}

function useCaseOf(
  fileMatches: readonly EngineFileMatches[],
  readFile: FakeReadFileUseCase = readFileWithEtag(Etag.of(Buffer.from('x'))),
): SearchReplacePreviewUseCase {
  const engine = new FakeSearchEngine([], fileMatches);
  const searchText = new SearchTextUseCase(
    new FakeFolderResolver(),
    engine,
    new SearchConcurrencyGate(2),
    20_000,
    250,
    20_971_520,
    5_242_880,
    BUDGET,
  );
  return new SearchReplacePreviewUseCase(searchText, readFile as unknown as ReadFileUseCase);
}

function inputOf(
  overrides: Record<string, unknown> = {},
): Parameters<SearchReplacePreviewUseCase['execute']>[0] {
  return {
    folder: '/srv/project',
    userId: USER_ID,
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    useIgnoreFiles: true,
    replacement: 'found',
    preserveCase: false,
    ...overrides,
  } as Parameters<SearchReplacePreviewUseCase['execute']>[0];
}

describe('SearchReplacePreviewUseCase — plan 11, B-11', () => {
  it('attaches the resolved replacement and the ETag of the file read — S-81', async () => {
    const etag = Etag.of(Buffer.from('a needle here\n'));
    const useCase = useCaseOf([fileOf()], readFileWithEtag(etag));

    const run = await useCase.execute(inputOf());
    const files = await drain(run.files);

    expect(files).toEqual([
      {
        path: 'a.txt',
        etag: etag.value,
        matches: [expect.objectContaining({ replacement: 'found', preview: 'a needle here' })],
      },
    ]);
  });

  it('resolves $0 to the matched text in the replacement — B-11', async () => {
    const useCase = useCaseOf([fileOf()]);

    const run = await useCase.execute(inputOf({ replacement: '[$0]' }));
    const [file] = await drain(run.files);

    expect(file?.matches[0]?.replacement).toBe('[needle]');
  });

  it('preserves case in the preview when asked — S-97', async () => {
    const useCase = useCaseOf([
      fileOf({
        lines: [
          {
            lineNumber: 1,
            lineText: 'Needle here',
            submatches: [{ startByte: 0, endByte: 6, text: 'Needle' }],
          },
        ],
      }),
    ]);

    const run = await useCase.execute(inputOf({ replacement: 'found', preserveCase: true }));
    const [file] = await drain(run.files);

    expect(file?.matches[0]?.replacement).toBe('Found');
  });

  it('leaves a file out of the preview when it vanished since the search — S-76 parity', async () => {
    const useCase = useCaseOf([fileOf()], readFileThatThrows(new FileNotFoundError('a.txt')));

    const run = await useCase.execute(inputOf());
    const files = await drain(run.files);

    expect(files).toEqual([]);
    await expect(run.outcome).resolves.toEqual({ truncated: null, skipped: 0 });
  });

  it('leaves a file out of the preview when it turned binary since the search', async () => {
    const useCase = useCaseOf(
      [fileOf()],
      readFileThatThrows(new FileNotTextError('a.txt', 'binary')),
    );

    const run = await useCase.execute(inputOf());

    expect(await drain(run.files)).toEqual([]);
  });

  it('leaves a file out of the preview when it cannot be encoded back', async () => {
    const useCase = useCaseOf(
      [fileOf()],
      readFileThatThrows(new FileNotEncodableError('a.txt', 'utf8')),
    );

    expect(await drain((await useCase.execute(inputOf())).files)).toEqual([]);
  });

  it('leaves a file out of the preview when it grew past the edit ceiling', async () => {
    const useCase = useCaseOf(
      [fileOf()],
      readFileThatThrows(new FileTooLargeError('a.txt', 10, 5, 'bytes')),
    );

    expect(await drain((await useCase.execute(inputOf())).files)).toEqual([]);
  });

  it('re-throws an error it does not know how to classify', async () => {
    const useCase = useCaseOf([fileOf()], readFileThatThrows(new Error('disk exploded')));

    await expect(drain((await useCase.execute(inputOf())).files)).rejects.toThrow('disk exploded');
  });

  it('leaves a file out of the preview when the read answers notModified, never reachable in practice', async () => {
    const useCase = useCaseOf([fileOf()], {
      execute: () => Promise.resolve({ kind: 'notModified' } as never),
    });

    expect(await drain((await useCase.execute(inputOf())).files)).toEqual([]);
  });

  it('refuses a regex replacement with a capture-group reference before the stream opens — S-82', async () => {
    const useCase = useCaseOf([]);

    await expect(useCase.execute(inputOf({ isRegex: true, replacement: '$1' }))).rejects.toThrow();
  });
});
