import { describe, expect, it } from 'vitest';

import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';

/** A promise and the hand that resolves it. */
function gate(): { readonly opened: Promise<void>; open(): void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('InMemoryPathLock — B-18', () => {
  it('runs the writers of one path one at a time, in the order they came — S-125', async () => {
    const lock = new InMemoryPathLock();
    const order: string[] = [];
    const first = gate();

    const a = lock.run('/srv/a', async () => {
      order.push('a:start');
      await first.opened;
      order.push('a:end');
    });
    const b = lock.run('/srv/a', async () => {
      order.push('b');
    });

    await Promise.resolve();
    expect(order).toEqual(['a:start']);

    first.open();
    await Promise.all([a, b]);
    expect(order).toEqual(['a:start', 'a:end', 'b']);
  });

  it('lets two different paths run at once', async () => {
    const lock = new InMemoryPathLock();
    const held = gate();
    const order: string[] = [];

    const a = lock.run('/srv/a', async () => {
      await held.opened;
      order.push('a');
    });
    await lock.run('/srv/b', () => {
      order.push('b');
      return Promise.resolve();
    });
    held.open();
    await a;

    expect(order).toEqual(['b', 'a']);
  });

  it('lets the next writer go when the one before failed, and keeps nothing once idle — S-127', async () => {
    const lock = new InMemoryPathLock();

    await expect(lock.run('/srv/a', () => Promise.reject(new Error('disk full')))).rejects.toThrow(
      'disk full',
    );
    await expect(lock.run('/srv/a', () => Promise.resolve('next'))).resolves.toBe('next');
    expect(lock.held).toBe(0);
  });
});
