import { describe, expect, it } from 'vitest';

import {
  FOLLOWED,
  largest,
  limited,
  measureFollow,
  REPEATS,
  reportLines,
  timingOf,
} from '../../../scripts/lib/follow-bench.mjs';

/**
 * A store of conversations of the given sizes, which counts what it was asked.
 *
 * @param {readonly (number | null)[]} sizes
 */
function storeOf(sizes) {
  const calls = { info: 0, messages: 0 };
  const sessions = sizes.map((fileSize, index) => ({
    sessionId: `${String(index).padStart(8, '0')}-secret-summary`,
    summary: 'never printed',
    ...(fileSize === null ? {} : { fileSize }),
  }));

  return {
    calls,
    sdk: {
      listSessions: () => Promise.resolve(sessions),
      getSessionInfo: () => {
        calls.info += 1;
        return Promise.resolve({});
      },
      getSessionMessages: () => {
        calls.messages += 1;
        return Promise.resolve([{ message: 'private words' }, {}]);
      },
    },
  };
}

/** A clock that moves one millisecond and one megabyte per reading. */
function steppingClock() {
  let now = 0;
  let heap = 0;
  return {
    now: () => (now += 1),
    heap: () => (heap += 1_048_576),
  };
}

describe('the follow bench — plan 22, B-19, S-73', () => {
  it('measures the largest transcript and the four largest together', async () => {
    const { sdk, calls } = storeOf([1_048_576, 5_242_880, null, 2_097_152, 3_145_728, 10]);

    const report = await measureFollow(sdk, steppingClock());

    expect(report?.conversations.map((each) => each.megabytes)).toEqual([5, 3, 2, 1]);
    expect(report?.conversations[0]).toEqual({ id: '00000001', megabytes: 5, entries: 2 });
    expect(calls.info).toBe(REPEATS.info + REPEATS.ticks * FOLLOWED);
    expect(calls.messages).toBe(REPEATS.messages + FOLLOWED + FOLLOWED);
    expect(report?.info).toEqual({ medianMs: 1, maxMs: 1 });
    expect(report?.heapMegabytes).toBe(1);
  });

  it('prints times and sizes, and never a word of a conversation', async () => {
    const report = await measureFollow(storeOf([1_048_576]).sdk, steppingClock());
    const printed = reportLines(
      report ??
        (() => {
          throw new Error('measured');
        })(),
    ).join('\n');

    expect(printed).toContain('getSessionInfo');
    expect(printed).toContain('00000000…');
    expect(printed).not.toMatch(/secret|summary|private/);
  });

  it('has nothing to measure in a store with no size', async () => {
    expect(await measureFollow(storeOf([null]).sdk, steppingClock())).toBeNull();
  });

  it.each([
    [[], { medianMs: 0, maxMs: 0 }],
    [[3, 1, 2], { medianMs: 2, maxMs: 3 }],
    [[4, 1, 2, 3], { medianMs: 2.5, maxMs: 4 }],
  ])('reads the median and the worst of %j', (samples, timing) => {
    expect(timingOf(samples)).toEqual(timing);
  });

  it('keeps only sessions with a size, the largest first', () => {
    expect(
      largest(
        [{ sessionId: 'a', fileSize: 1 }, { sessionId: 'b' }, { sessionId: 'c', fileSize: 9 }],
        5,
      ),
    ).toEqual([
      { sessionId: 'c', fileSize: 9 },
      { sessionId: 'a', fileSize: 1 },
    ]);
  });

  it('runs at most two reads at once, as the limiter does', async () => {
    let running = 0;
    let most = 0;
    const task = async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
    };

    await limited([task, task, task, task, task], 2);
    await limited([], 2);

    expect(most).toBe(2);
  });
});
