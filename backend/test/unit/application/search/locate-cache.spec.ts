import { describe, expect, it, vi } from 'vitest';

import { LocateCache } from '@application/search';
import { FixedClock } from '../../../support/fakes/fixed-clock';

describe('LocateCache — plan 11, D-07', () => {
  it('computes once and serves the fresh entry from cache on the next call', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const cache = new LocateCache(10_000, clock);
    const compute = vi.fn(async () => ({ paths: ['a.ts'], truncated: null, skipped: 0 }));

    const first = await cache.get('/srv/project', compute);
    const second = await cache.get('/srv/project', compute);

    expect(first).toEqual({ paths: ['a.ts'], truncated: null, skipped: 0 });
    expect(second).toEqual({ paths: ['a.ts'], truncated: null, skipped: 0 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes once the TTL has passed', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const cache = new LocateCache(10_000, clock);
    const compute = vi.fn(async () => ({ paths: ['a.ts'], truncated: null, skipped: 0 }));

    await cache.get('/srv/project', compute);
    clock.advance(10_001);
    await cache.get('/srv/project', compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('keeps separate folders separate', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const cache = new LocateCache(10_000, clock);

    const a = await cache.get('/srv/a', async () => ({
      paths: ['a.ts'],
      truncated: null,
      skipped: 0,
    }));
    const b = await cache.get('/srv/b', async () => ({
      paths: ['b.ts'],
      truncated: null,
      skipped: 0,
    }));

    expect(a.paths).toEqual(['a.ts']);
    expect(b.paths).toEqual(['b.ts']);
  });

  it('single-flights two concurrent cold requests for the same folder — S-57', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const cache = new LocateCache(10_000, clock);
    let resolveCompute: (value: {
      paths: string[];
      truncated: null;
      skipped: number;
    }) => void = () => {};
    const compute = vi.fn(
      () =>
        new Promise<{ paths: string[]; truncated: null; skipped: number }>((resolve) => {
          resolveCompute = resolve;
        }),
    );

    const first = cache.get('/srv/project', compute);
    const second = cache.get('/srv/project', compute);
    resolveCompute({ paths: ['a.ts'], truncated: null, skipped: 0 });

    expect(await first).toEqual(await second);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('a folder invalidated is recomputed on the very next request — S-58', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const cache = new LocateCache(10_000, clock);
    const compute = vi.fn(async () => ({ paths: ['a.ts'], truncated: null, skipped: 0 }));

    await cache.get('/srv/project', compute);
    cache.invalidate('/srv/project');
    await cache.get('/srv/project', compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('a failed compute is not cached, and the next call tries again', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const cache = new LocateCache(10_000, clock);
    let callCount = 0;
    const compute = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) throw new Error('boom');
      return { paths: ['a.ts'], truncated: null, skipped: 0 };
    });

    await expect(cache.get('/srv/project', compute)).rejects.toThrow('boom');
    await expect(cache.get('/srv/project', compute)).resolves.toEqual({
      paths: ['a.ts'],
      truncated: null,
      skipped: 0,
    });
  });

  describe('aborting a cold listing — S-62', () => {
    function neverSettlingCompute(): {
      readonly compute: (signal: AbortSignal) => Promise<never>;
      engineSignal(): AbortSignal | null;
    } {
      let seen: AbortSignal | null = null;
      return {
        compute: vi.fn((signal: AbortSignal) => {
          seen = signal;
          return new Promise<never>(() => {});
        }),
        engineSignal: () => seen,
      };
    }

    it('kills the listing once its one caller aborts, nobody else waiting', () => {
      const cache = new LocateCache(10_000, new FixedClock(new Date('2026-01-01T00:00:00Z')));
      const { compute, engineSignal } = neverSettlingCompute();
      const controller = new AbortController();

      void cache.get('/srv/project', compute, controller.signal);
      expect(engineSignal()?.aborted).toBe(false);

      controller.abort();

      expect(engineSignal()?.aborted).toBe(true);
    });

    it('keeps the listing alive for a second waiter once the first one aborts', () => {
      const cache = new LocateCache(10_000, new FixedClock(new Date('2026-01-01T00:00:00Z')));
      const { compute, engineSignal } = neverSettlingCompute();
      const first = new AbortController();
      const second = new AbortController();

      void cache.get('/srv/project', compute, first.signal);
      void cache.get('/srv/project', compute, second.signal);
      first.abort();

      expect(engineSignal()?.aborted).toBe(false);
      expect(compute).toHaveBeenCalledTimes(1);

      second.abort();

      expect(engineSignal()?.aborted).toBe(true);
    });

    it('a caller that gives no signal is a permanent waiter — the listing never dies on its account', () => {
      const cache = new LocateCache(10_000, new FixedClock(new Date('2026-01-01T00:00:00Z')));
      const { compute, engineSignal } = neverSettlingCompute();
      const tracked = new AbortController();

      void cache.get('/srv/project', compute); // no signal at all
      void cache.get('/srv/project', compute, tracked.signal);
      tracked.abort();

      expect(engineSignal()?.aborted).toBe(false);
    });

    it('a caller joining with an already-aborted signal never becomes a waiter at all', () => {
      const cache = new LocateCache(10_000, new FixedClock(new Date('2026-01-01T00:00:00Z')));
      const { compute, engineSignal } = neverSettlingCompute();
      const already = new AbortController();
      already.abort();

      void cache.get('/srv/project', compute, already.signal);

      expect(engineSignal()?.aborted).toBe(true);
    });
  });
});
