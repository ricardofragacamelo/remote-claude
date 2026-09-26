import { describe, expect, it } from 'vitest';

import {
  ReadLimiter,
  TRANSCRIPT_READ_LIMITS,
  TranscriptCache,
} from '@adapter/outbound/claude/transcript-reads';

/** A promise the test settles by hand. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (e: Error) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });

  return { promise, resolve, reject };
}

/** Lets every pending microtask run. */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('the read limits', () => {
  it('are finite, and positive', () => {
    expect(TRANSCRIPT_READ_LIMITS.cachedSessions).toBeGreaterThan(0);
    expect(TRANSCRIPT_READ_LIMITS.concurrentReads).toBeGreaterThan(0);
    expect(TRANSCRIPT_READ_LIMITS.timeoutMs).toBeGreaterThan(0);
  });
});

describe('ReadLimiter — S-70', () => {
  it('runs up to its capacity at once, and queues the rest in order', async () => {
    const limiter = new ReadLimiter(2);
    const tasks = [deferred<string>(), deferred<string>(), deferred<string>()];
    const started: number[] = [];

    const runs = tasks.map((task, index) =>
      limiter.run(() => {
        started.push(index);
        return task.promise;
      }),
    );
    await flush();

    expect(started).toEqual([0, 1]);
    expect(limiter.active).toBe(2);
    expect(limiter.queued).toBe(1);

    tasks[0]?.resolve('a');
    await flush();

    expect(started).toEqual([0, 1, 2]);
    expect(limiter.active).toBe(2);

    tasks[1]?.resolve('b');
    tasks[2]?.resolve('c');

    await expect(Promise.all(runs)).resolves.toEqual(['a', 'b', 'c']);
    expect(limiter.active).toBe(0);
  });

  it('never exceeds its capacity when a new read arrives as a slot is handed over', async () => {
    const limiter = new ReadLimiter(1);
    const first = deferred<void>();
    let running = 0;
    let peak = 0;
    const track = async (wait: Promise<void>): Promise<void> => {
      running += 1;
      peak = Math.max(peak, running);
      await wait;
      running -= 1;
    };

    const a = limiter.run(() => track(first.promise));
    const b = limiter.run(() => track(Promise.resolve()));
    await flush();
    first.resolve();
    // Arrives in the very turn the slot passes from `a` to `b`.
    const c = limiter.run(() => track(Promise.resolve()));

    await Promise.all([a, b, c]);
    expect(peak).toBe(1);
  });

  it('gives the slot back when a read fails', async () => {
    const limiter = new ReadLimiter(1);

    await expect(limiter.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(limiter.run(() => Promise.resolve('next'))).resolves.toBe('next');
    expect(limiter.active).toBe(0);
  });
});

describe('TranscriptCache', () => {
  it('loads once per version, and hits after — S-64', async () => {
    const cache = new TranscriptCache<string>(4);
    let loads = 0;
    const load = (): Promise<string> => {
      loads += 1;
      return Promise.resolve(`v${String(loads)}`);
    };

    expect(await cache.read('s', 1, load)).toEqual({ value: 'v1', hit: false });
    expect(await cache.read('s', 1, load)).toEqual({ value: 'v1', hit: true });
    expect(loads).toBe(1);
  });

  it('reloads when the version moved — S-64', async () => {
    const cache = new TranscriptCache<string>(4);

    await cache.read('s', 1, () => Promise.resolve('old'));

    expect(await cache.read('s', 2, () => Promise.resolve('new'))).toEqual({
      value: 'new',
      hit: false,
    });
    expect(cache.size).toBe(1);
  });

  it('shares one load between two readers of the same version — S-70', async () => {
    const cache = new TranscriptCache<string>(4);
    const parse = deferred<string>();
    let loads = 0;
    const load = (): Promise<string> => {
      loads += 1;
      return parse.promise;
    };

    const first = cache.read('s', 1, load);
    const second = cache.read('s', 1, load);
    parse.resolve('parsed');

    expect(await first).toEqual({ value: 'parsed', hit: false });
    expect(await second).toEqual({ value: 'parsed', hit: true });
    expect(loads).toBe(1);
  });

  it('forgets a load that failed, so the next reader tries again', async () => {
    const cache = new TranscriptCache<string>(4);

    await expect(cache.read('s', 1, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );

    expect(await cache.read('s', 1, () => Promise.resolve('ok'))).toEqual({
      value: 'ok',
      hit: false,
    });
  });

  it('keeps at most its capacity, dropping the one read longest ago — S-74', async () => {
    const cache = new TranscriptCache<string>(2);

    await cache.read('a', 1, () => Promise.resolve('a'));
    await cache.read('b', 1, () => Promise.resolve('b'));
    // Reading `a` again makes `b` the least recently read.
    await cache.read('a', 1, () => Promise.resolve('never'));
    await cache.read('c', 1, () => Promise.resolve('c'));

    expect(cache.size).toBe(2);
    expect((await cache.read('a', 1, () => Promise.resolve('reloaded'))).hit).toBe(true);
    expect((await cache.read('b', 1, () => Promise.resolve('reloaded'))).hit).toBe(false);
  });
});
