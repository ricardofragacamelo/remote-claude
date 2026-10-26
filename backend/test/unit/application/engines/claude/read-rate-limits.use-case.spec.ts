import { describe, expect, it } from 'vitest';

import { ReadRateLimitsUseCase } from '@application/engines/claude';
import type { RateLimitStore, UsageProbe } from '@application/engines/claude';
import type { FolderAccess } from '@application/agent-settings';
import { UserId } from '@domain/auth';
import type { RateLimitWindow } from '@domain/engines/claude';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../../../../support/fakes/fixed-clock';

const USER = UserId.create('auth|42');
const ROOT = WorkspacePath.create('/srv');

const WINDOW: RateLimitWindow = {
  kind: 'five_hour',
  status: 'allowed',
  utilizationPercent: 8,
  resetsAt: null,
  observedAt: new Date('2026-10-26T12:00:00.000Z'),
};

const folders = (root: WorkspacePath | null = ROOT): FolderAccess => ({
  resolve: (raw) => Promise.resolve(WorkspacePath.create(raw)),
  locate: (raw) => Promise.resolve({ folder: WorkspacePath.create(raw), root: '/srv' }),
  firstRoot: () => Promise.resolve(root),
});

/** A store that just remembers what it was told, the way the real in-memory one does. */
function memoryStore(): RateLimitStore {
  const windows = new Map<string, RateLimitWindow>();
  return {
    observe: (window) => {
      windows.set(window.kind, window);
    },
    current: () => [...windows.values()],
  };
}

/** A probe that counts how many times it was actually asked, and answers what the test wants. */
function countingProbe(answer: () => Promise<readonly RateLimitWindow[]>): UsageProbe & {
  readonly calls: number[];
} {
  const calls: number[] = [];
  return {
    calls,
    probe: (folder) => {
      calls.push(folder === ROOT ? 1 : 0);
      return answer();
    },
  };
}

describe('reading the account’s rate limits, with the on-demand probe throttled — plan 16, D-09', () => {
  it('probes on the first read and merges what it found into the store', async () => {
    const store = memoryStore();
    const probe = countingProbe(() => Promise.resolve([WINDOW]));
    const useCase = new ReadRateLimitsUseCase(store, probe, folders(), new FixedClock(new Date()));

    const windows = await useCase.execute(USER);

    expect(probe.calls).toHaveLength(1);
    expect(windows).toEqual([WINDOW]);
  });

  it('does not probe again within the TTL, and reads the same store state', async () => {
    const store = memoryStore();
    const probe = countingProbe(() => Promise.resolve([WINDOW]));
    const clock = new FixedClock(new Date('2026-10-26T12:00:00.000Z'));
    const useCase = new ReadRateLimitsUseCase(store, probe, folders(), clock);

    await useCase.execute(USER);
    clock.advance(10_000);
    await useCase.execute(USER);

    expect(probe.calls).toHaveLength(1);
  });

  it('probes again once the TTL has elapsed', async () => {
    const store = memoryStore();
    const probe = countingProbe(() => Promise.resolve([WINDOW]));
    const clock = new FixedClock(new Date('2026-10-26T12:00:00.000Z'));
    const useCase = new ReadRateLimitsUseCase(store, probe, folders(), clock);

    await useCase.execute(USER);
    clock.advance(31_000);
    await useCase.execute(USER);

    expect(probe.calls).toHaveLength(2);
  });

  it('de-duplicates concurrent reads into a single probe', async () => {
    const store = memoryStore();
    const probe = countingProbe(() => Promise.resolve([WINDOW]));
    const useCase = new ReadRateLimitsUseCase(store, probe, folders(), new FixedClock(new Date()));

    await Promise.all([useCase.execute(USER), useCase.execute(USER), useCase.execute(USER)]);

    expect(probe.calls).toHaveLength(1);
  });

  it('skips the probe, without throwing, when the user has no root to spawn it in', async () => {
    const store = memoryStore();
    const probe = countingProbe(() => Promise.resolve([WINDOW]));
    const useCase = new ReadRateLimitsUseCase(
      store,
      probe,
      folders(null),
      new FixedClock(new Date()),
    );

    const windows = await useCase.execute(USER);

    expect(probe.calls).toHaveLength(0);
    expect(windows).toEqual([]);
  });

  it('still answers whatever the store already held when the probe itself found nothing new', async () => {
    const store = memoryStore();
    store.observe(WINDOW);
    const probe = countingProbe(() => Promise.resolve([]));
    const useCase = new ReadRateLimitsUseCase(store, probe, folders(), new FixedClock(new Date()));

    expect(await useCase.execute(USER)).toEqual([WINDOW]);
  });
});
