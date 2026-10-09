import { describe, expect, it } from 'vitest';

import { SingleFlight } from '@application/shared';

/** A call held until the test lets it go. */
function held<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('one call in flight per key', () => {
  it('gives whoever asks while the first runs the first’s answer, and asks again once it settled', async () => {
    const flight = new SingleFlight<number>();
    const call = held<number>();
    let calls = 0;
    const ask = () => {
      calls += 1;
      return call.promise;
    };

    const first = flight.run('a', ask);
    const second = flight.run('a', ask);
    call.resolve(7);

    expect(await Promise.all([first, second])).toEqual([7, 7]);
    expect(calls).toBe(1);

    await flight.run('a', () => Promise.resolve(8));
    expect(calls).toBe(1);
  });

  it('keeps keys apart, and a failure reaches every caller and is not kept', async () => {
    const flight = new SingleFlight<string>();
    const failing = held<string>();

    const first = flight.run('a', () => failing.promise);
    const second = flight.run('a', () => Promise.resolve('never'));
    const other = flight.run('b', () => Promise.resolve('b'));
    failing.reject(new Error('boom'));

    await expect(first).rejects.toThrow('boom');
    await expect(second).rejects.toThrow('boom');
    expect(await other).toBe('b');
    expect(await flight.run('a', () => Promise.resolve('again'))).toBe('again');
  });
});
