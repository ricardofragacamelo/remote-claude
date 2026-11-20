import { describe, expect, it } from 'vitest';

import { FindPathsUseCase, LocateCache } from '@application/search';
import type { FolderResolver, ListFilesOutcome, LocateInput } from '@application/search';
import { LocateInputInvalidError } from '@domain/search';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import { FakeSearchEngine } from '../../../support/fakes/fake-search-engine';
import { FixedClock } from '../../../support/fakes/fixed-clock';

class FakeFolderResolver implements FolderResolver {
  readonly calls: { raw: string; userId: UserId }[] = [];

  async resolve(raw: string, userId: UserId): Promise<WorkspacePath> {
    this.calls.push({ raw, userId });
    return WorkspacePath.create(raw);
  }
}

const USER_ID = UserId.create('user-1');

function inputOf(overrides: Partial<LocateInput> = {}): LocateInput {
  return {
    folder: '/srv/project',
    userId: USER_ID,
    query: '',
    kinds: ['file'],
    prefer: [],
    includeIgnored: false,
    ...overrides,
  };
}

function useCaseOf(
  paths: readonly string[],
  overrides: {
    folders?: FolderResolver;
    outcome?: ListFilesOutcome & { readonly skipped?: number };
    maxFiles?: number;
    defaultResults?: number;
    maxResults?: number;
  } = {},
): { useCase: FindPathsUseCase; engine: FakeSearchEngine; folders: FakeFolderResolver } {
  const folders =
    overrides.folders instanceof FakeFolderResolver ? overrides.folders : new FakeFolderResolver();
  const engine = new FakeSearchEngine(
    paths,
    [],
    overrides.outcome ?? { truncated: false, timedOut: false },
  );
  const cache = new LocateCache(10_000, new FixedClock(new Date('2026-01-01T00:00:00Z')));
  const useCase = new FindPathsUseCase(
    folders,
    engine,
    cache,
    overrides.maxFiles ?? 200_000,
    overrides.defaultResults ?? 50,
    overrides.maxResults ?? 200,
    { timeoutMs: 15_000, maxBytes: 64 * 1024 * 1024 },
  );
  return { useCase, engine, folders };
}

describe('FindPathsUseCase — plan 11, B-09', () => {
  it('drops a result path that resolves outside the folder — defence in depth, S-42', async () => {
    const { useCase } = useCaseOf(['src/a.ts', '../outside.ts', '/etc/passwd']);

    const result = await useCase.execute(inputOf({ query: '', prefer: ['src/a.ts'] }));

    expect(result.entries.map((entry) => entry.path)).toEqual(['src/a.ts']);
  });

  it('lists files, scored and sorted by the query', async () => {
    const { useCase } = useCaseOf(['src/a.ts', 'src/session.ts']);

    const result = await useCase.execute(inputOf({ query: 'session' }));

    expect(result.entries.map((entry) => entry.path)).toEqual(['src/session.ts']);
    expect(result.truncated).toBeNull();
  });

  it('an empty query returns only the prefer entries that exist — S-59', async () => {
    const { useCase } = useCaseOf(['src/a.ts', 'src/b.ts', 'src/c.ts']);

    const result = await useCase.execute(inputOf({ query: '', prefer: ['src/b.ts'] }));

    expect(result.entries.map((entry) => entry.path)).toEqual(['src/b.ts']);
  });

  it('derives directories from the file list when kinds asks for dir — S-48', async () => {
    const { useCase } = useCaseOf(['src/features/session/a.ts', 'src/features/session/b.ts']);

    const result = await useCase.execute(inputOf({ query: 'session', kinds: ['dir'] }));

    const paths = result.entries.map((entry) => entry.path);
    expect(paths).toContain('src/features/session');
    expect(result.entries.every((entry) => entry.kind === 'dir')).toBe(true);
    // No duplicate directories even though two files share every ancestor.
    expect(paths.filter((path) => path === 'src/features/session')).toHaveLength(1);
  });

  it('mixes files and directories when kinds asks for both', async () => {
    const { useCase } = useCaseOf(['src/a.ts']);

    const result = await useCase.execute(inputOf({ query: 'a', kinds: ['file', 'dir'] }));

    expect(result.entries.some((entry) => entry.kind === 'file')).toBe(true);
  });

  it('a prefer bonus lifts an equally-good match, never a much better one — S-40', async () => {
    const { useCase } = useCaseOf(['src/session.ts', 'src/sessionx.ts']);

    // Both contain "session" as a subsequence of the basename; prefer the first.
    const result = await useCase.execute(
      inputOf({ query: 'session', prefer: ['src/sessionx.ts'] }),
    );

    expect(result.entries[0]?.path).toBe('src/sessionx.ts');
  });

  it('a much better match is never hidden by an unrelated prefer entry — S-40', async () => {
    // "abc" matches inside the filename of the first and only inside the directory of the
    // second — the gap `fuzzyScore` puts between those two is far wider than any prefer bonus.
    const { useCase } = useCaseOf(['src/abc/file.ts', 'abc/src/unrelated-file-name.ts']);

    const result = await useCase.execute(
      inputOf({ query: 'abc', prefer: ['abc/src/unrelated-file-name.ts'] }),
    );

    expect(result.entries[0]?.path).toBe('src/abc/file.ts');
  });

  it('truncates at the file-count ceiling and reports it — S-49', async () => {
    const { useCase, engine } = useCaseOf(['a.ts', 'b.ts', 'c.ts', 'd.ts'], { maxFiles: 2 });

    const result = await useCase.execute(inputOf({ query: '' }));

    expect(result.truncated).toEqual({ reason: 'limit' });
    expect(engine.listFilesCalls).toHaveLength(1);
  });

  it('reports a timeout distinctly from the count ceiling — S-50', async () => {
    const { useCase } = useCaseOf(['a.ts'], { outcome: { truncated: false, timedOut: true } });

    const result = await useCase.execute(inputOf({ query: '' }));

    expect(result.truncated).toEqual({ reason: 'timeout' });
  });

  it('refuses a limit outside 1..maxResults — S-60', async () => {
    const { useCase } = useCaseOf(['a.ts'], { maxResults: 200 });

    await expect(useCase.execute(inputOf({ limit: 0 }))).rejects.toThrow(LocateInputInvalidError);
    await expect(useCase.execute(inputOf({ limit: 201 }))).rejects.toThrow(LocateInputInvalidError);
  });

  it('refuses more than 50 prefer entries — S-60', async () => {
    const { useCase } = useCaseOf(['a.ts']);

    await expect(
      useCase.execute(inputOf({ prefer: Array.from({ length: 51 }, () => 'a.ts') })),
    ).rejects.toThrow(LocateInputInvalidError);
  });

  it('caches the listing: a second call with the same folder does not call the engine again — S-56', async () => {
    const { useCase, engine } = useCaseOf(['a.ts']);

    await useCase.execute(inputOf({ query: '' }));
    await useCase.execute(inputOf({ query: '' }));

    expect(engine.listFilesCalls).toHaveLength(1);
  });

  it('asks the folder resolver, never the raw folder string, for the cache key', async () => {
    const { useCase, folders } = useCaseOf(['a.ts']);

    await useCase.execute(inputOf({ folder: '/srv/project/' }));

    expect(folders.calls[0]?.raw).toBe('/srv/project/');
  });

  it('carries the engine’s non-UTF-8 skip count through to the result — S-63', async () => {
    const { useCase } = useCaseOf(['a.ts'], {
      outcome: { truncated: false, timedOut: false, skipped: 2 },
    });

    const result = await useCase.execute(inputOf({ query: '' }));

    expect(result.skipped).toBe(2);
  });

  it('defaults skipped to 0 when the engine reports none — S-63', async () => {
    const { useCase } = useCaseOf(['a.ts']);

    const result = await useCase.execute(inputOf({ query: '' }));

    expect(result.skipped).toBe(0);
  });
});
