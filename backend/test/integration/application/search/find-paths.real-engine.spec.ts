import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FindPathsUseCase, LocateCache } from '@application/search';
import type { FolderResolver } from '@application/search';
import { NodeChildProcessRunner } from '@adapter/outbound/process/node-child-process.runner';
import { RipgrepAdapter } from '@adapter/outbound/search/ripgrep.adapter';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import { resolveRipgrepBinary } from '@infra/config/ripgrep-binary';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

class FixedFolderResolver implements FolderResolver {
  constructor(private readonly path: string) {}

  async resolve(): Promise<WorkspacePath> {
    return WorkspacePath.create(this.path);
  }
}

const USER_ID = UserId.create('user-1');

describe('the locator against a real ripgrep binary — plan 11, B-09', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'rc-locate-'));
    await mkdir(join(folder, 'src/features/session'), { recursive: true });
    await mkdir(join(folder, 'node_modules/left-pad'), { recursive: true });
    await writeFile(join(folder, 'src/features/session/SessionScreen.tsx'), 'export {};\n');
    await writeFile(join(folder, 'src/index.ts'), 'export {};\n');
    await writeFile(join(folder, '.gitignore'), 'ignored.txt\n');
    await writeFile(join(folder, 'ignored.txt'), 'should not be listed\n');
    await writeFile(join(folder, 'node_modules/left-pad/index.js'), 'module.exports = {};\n');
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  async function useCaseOf(): Promise<FindPathsUseCase> {
    const logger = new RecordingLogger().logger;
    const runner = new NodeChildProcessRunner(logger);
    const binary = await resolveRipgrepBinary(null, logger);
    const engine = new RipgrepAdapter(runner, binary);
    const cache = new LocateCache(10_000, new FixedClock(new Date('2026-01-01T00:00:00Z')));
    return new FindPathsUseCase(new FixedFolderResolver(folder), engine, cache, 200_000, 50, 200, {
      timeoutMs: 15_000,
      maxBytes: 64 * 1024 * 1024,
    });
  }

  it('finds a file deep in the tree by a fuzzy subsequence — S-39', async () => {
    const useCase = await useCaseOf();

    const result = await useCase.execute({
      folder,
      userId: USER_ID,
      query: 'sess',
      kinds: ['file'],
      prefer: [],
      includeIgnored: false,
    });

    expect(result.entries.map((entry) => entry.path)).toContain(
      'src/features/session/SessionScreen.tsx',
    );
  });

  it('respects .gitignore by default — D-03', async () => {
    const useCase = await useCaseOf();

    const result = await useCase.execute({
      folder,
      userId: USER_ID,
      query: '',
      kinds: ['file'],
      prefer: ['ignored.txt', 'src/index.ts'],
      includeIgnored: false,
    });

    const paths = result.entries.map((entry) => entry.path);
    expect(paths).not.toContain('ignored.txt');
    expect(paths).toContain('src/index.ts');
  });

  it('includes the ignored file when includeIgnored is set — S-46', async () => {
    const useCase = await useCaseOf();

    const result = await useCase.execute({
      folder,
      userId: USER_ID,
      query: '',
      kinds: ['file'],
      prefer: ['ignored.txt'],
      includeIgnored: true,
    });

    expect(result.entries.map((entry) => entry.path)).toContain('ignored.txt');
  });

  it('excludes node_modules by default, even though it is not gitignored here — D-03', async () => {
    const useCase = await useCaseOf();

    const result = await useCase.execute({
      folder,
      userId: USER_ID,
      query: '',
      kinds: ['file'],
      prefer: ['node_modules/left-pad/index.js'],
      includeIgnored: false,
    });

    expect(result.entries.map((entry) => entry.path)).not.toContain(
      'node_modules/left-pad/index.js',
    );
  });

  it('derives directories and respects the folder realpath cache across two calls — S-56', async () => {
    const useCase = await useCaseOf();

    const first = await useCase.execute({
      folder,
      userId: USER_ID,
      query: 'session',
      kinds: ['dir'],
      prefer: [],
      includeIgnored: false,
    });
    const second = await useCase.execute({
      folder,
      userId: USER_ID,
      query: 'session',
      kinds: ['dir'],
      prefer: [],
      includeIgnored: false,
    });

    expect(first.entries.map((entry) => entry.path)).toContain('src/features/session');
    expect(second).toEqual(first);
  });

  it('aborting the caller kills the real ripgrep process underneath it — S-62', async () => {
    const useCase = await useCaseOf();
    // A folder deep and wide enough that `rg --files` does not finish before we abort it.
    for (let i = 0; i < 500; i += 1) {
      await mkdir(join(folder, `many/dir-${String(i)}`), { recursive: true });
      await writeFile(join(folder, `many/dir-${String(i)}/file.ts`), 'export {};\n');
    }
    const controller = new AbortController();

    const call = useCase.execute(
      { folder, userId: USER_ID, query: '', kinds: ['file'], prefer: [], includeIgnored: false },
      controller.signal,
    );
    controller.abort();

    await expect(call).rejects.toThrow();
  });

  it('omits a file whose name cannot be decoded as UTF-8, and counts it in skipped — S-63', async () => {
    const useCase = await useCaseOf();
    const hostileName = Buffer.concat([
      Buffer.from('hostile-'),
      Buffer.from([0xff]),
      Buffer.from('.txt'),
    ]);
    await writeFile(Buffer.concat([Buffer.from(`${folder}/`), hostileName]), 'x');

    const result = await useCase.execute({
      folder,
      userId: USER_ID,
      query: '',
      kinds: ['file'],
      prefer: ['src/index.ts'],
      includeIgnored: false,
    });

    expect(result.entries.some((entry) => entry.path.includes('hostile-'))).toBe(false);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });
});
