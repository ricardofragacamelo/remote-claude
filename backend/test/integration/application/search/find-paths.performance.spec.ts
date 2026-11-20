import { describe, expect, it } from 'vitest';

import { FindPathsUseCase, LocateCache } from '@application/search';
import type { FolderResolver } from '@application/search';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import { FakeSearchEngine } from '../../../support/fakes/fake-search-engine';
import { FixedClock } from '../../../support/fakes/fixed-clock';

class FixedFolderResolver implements FolderResolver {
  constructor(private readonly path: string) {}

  async resolve(): Promise<WorkspacePath> {
    return WorkspacePath.create(this.path);
  }
}

const USER_ID = UserId.create('user-1');
const FOLDER = '/srv/project';
const FILE_COUNT = 50_000;
/** Enough calls that the JIT has compiled the hot fuzzy-scoring path before a sample is timed. */
const WARMUP = 20;
/**
 * Enough samples that one slow tick (GC, scheduler) never alone decides the 95th percentile —
 * measured not to help further past this: under genuine CPU oversubscription (more runnable work
 * than cores — reproduced with busy-loop processes, not just assumed), every call slows down, not
 * just the tail, and more samples only risks tripping `testTimeout` instead of fixing anything
 * (measured at 500 — see progress.md entry 66/67). This is a real-contention limitation of a wall-
 * clock assertion inside a large concurrent suite, not something any sample count resolves.
 */
const SAMPLES = 100;

function manyPaths(count: number): string[] {
  const paths: string[] = [];
  for (let i = 0; i < count; i += 1) {
    paths.push(`src/feature-${String(i % 500)}/module-${String(i)}/file-${String(i)}.ts`);
  }
  return paths;
}

function useCaseOf(paths: readonly string[]): FindPathsUseCase {
  const cache = new LocateCache(10_000, new FixedClock(new Date('2026-01-01T00:00:00Z')));
  return new FindPathsUseCase(
    new FixedFolderResolver(FOLDER),
    new FakeSearchEngine(paths),
    cache,
    200_000,
    50,
    200,
    { timeoutMs: 15_000, maxBytes: 64 * 1024 * 1024 },
  );
}

function percentile(durationsMs: readonly number[], fraction: number): number {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

/**
 * The p95 budget the contract names for a cached listing (D-06) — **measured**, not assumed:
 * a 50k-file folder, already cached, so this is the in-process ranking cost alone, the one
 * `rg --files` itself never bounds (S-61).
 */
describe('FindPathsUseCase performance — plan 11, B-09, S-61', () => {
  it('answers a query against a 50k-file cached listing with p95 under 150ms', async () => {
    const useCase = useCaseOf(manyPaths(FILE_COUNT));
    const input = (query: string): Parameters<FindPathsUseCase['execute']>[0] => ({
      folder: FOLDER,
      userId: USER_ID,
      query,
      kinds: ['file'],
      prefer: [],
      includeIgnored: false,
    });

    // Warms the cache once — a cold `rg --files` run is its own, separate budget, not S-61's —
    // then warms the JIT itself, so a timed sample never pays for the engine's own first runs.
    await useCase.execute(input(''));
    for (let i = 0; i < WARMUP; i += 1) {
      await useCase.execute(input(`warmup-${String(i)}`));
    }

    const durationsMs: number[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const start = performance.now();
      await useCase.execute(input(`module-${String(i)}`));
      durationsMs.push(performance.now() - start);
    }

    expect(percentile(durationsMs, 0.95)).toBeLessThan(150);
  });
});
