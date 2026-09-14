import { describe, expect, it, vi } from 'vitest';

import { WaitError, processAbort, waitForHttp, waitUntil } from '../../../scripts/lib/wait.mjs';

/** A clock the test drives, so a 120 s timeout costs no wall-clock time. */
function fakeClock() {
  let current = 0;

  return {
    now: () => current,
    /** @param {number} ms */
    sleep: (ms) => {
      current += ms;
      return Promise.resolve();
    },
  };
}

/**
 * The WaitError a failing wait produced. A wait that unexpectedly succeeds fails the test here
 * rather than further down, where the assertion would read as a type error.
 *
 * @param {Promise<void>} pending
 * @returns {Promise<WaitError>}
 */
async function rejection(pending) {
  try {
    await pending;
  } catch (error) {
    if (error instanceof WaitError) {
      return error;
    }
    throw error;
  }

  throw new Error('the wait resolved, but it was expected to fail');
}

describe('waitUntil', () => {
  it('returns as soon as the probe answers true', async () => {
    const clock = fakeClock();
    const probe = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);

    await waitUntil({ target: 'service', probe, intervalMs: 100, ...clock });

    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('gives up at the deadline, naming what it waited for', async () => {
    const clock = fakeClock();

    await expect(
      waitUntil({
        target: 'postgres',
        probe: () => Promise.resolve(false),
        timeoutMs: 1_000,
        intervalMs: 100,
        ...clock,
      }),
    ).rejects.toThrow(/postgres did not answer within 1000ms/);
  });

  it('marks a timeout as not a death, so the caller can tell the two apart', async () => {
    const clock = fakeClock();
    const failure = await rejection(
      waitUntil({
        target: 'keycloak',
        probe: () => Promise.resolve(false),
        timeoutMs: 500,
        intervalMs: 100,
        ...clock,
      }),
    );

    expect(failure).toBeInstanceOf(WaitError);
    expect(failure.died).toBe(false);
    expect(failure.target).toBe('keycloak');
  });

  it('aborts the moment the thing it waits for dies, instead of hanging until the deadline', async () => {
    const clock = fakeClock();
    const probe = vi.fn().mockResolvedValue(false);

    const failure = await rejection(
      waitUntil({
        target: 'backend',
        probe,
        abortIf: () => 'exited with code 1 before it was ready',
        timeoutMs: 600_000,
        ...clock,
      }),
    );

    expect(failure.died).toBe(true);
    expect(failure.message).toContain('exited with code 1');
    // The point of the whole thing: it did not sit through a ten-minute timeout first.
    expect(probe).not.toHaveBeenCalled();
  });

  it('checks liveness on every attempt, not only the first', async () => {
    const clock = fakeClock();
    let alive = true;
    const probe = vi.fn(() => {
      alive = false;
      return Promise.resolve(false);
    });

    const failure = await rejection(
      waitUntil({
        target: 'backend',
        probe,
        abortIf: () => (alive ? null : 'died'),
        timeoutMs: 600_000,
        intervalMs: 10,
        ...clock,
      }),
    );

    expect(probe).toHaveBeenCalledTimes(1);
    expect(failure.died).toBe(true);
  });
});

describe('processAbort', () => {
  it('reports nothing while the process is running', () => {
    const running = /** @type {import('node:child_process').ChildProcess} */ (
      /** @type {unknown} */ ({ exitCode: null, signalCode: null })
    );

    expect(processAbort(running)()).toBeNull();
  });

  it('reports nothing when there is no process to watch', () => {
    expect(processAbort(undefined)()).toBeNull();
  });

  it('names the exit code of a process that died', () => {
    const dead = /** @type {import('node:child_process').ChildProcess} */ (
      /** @type {unknown} */ ({ exitCode: 1, signalCode: null })
    );

    expect(processAbort(dead)()).toContain('code 1');
  });

  it('names the signal when the process was killed', () => {
    const killed = /** @type {import('node:child_process').ChildProcess} */ (
      /** @type {unknown} */ ({ exitCode: null, signalCode: 'SIGKILL' })
    );

    expect(processAbort(killed)()).toContain('SIGKILL');
  });
});

describe('waitForHttp', () => {
  it('gives up on an endpoint that never answers, without throwing the fetch error', async () => {
    // Port 1 on loopback refuses instantly, which is the "still booting" case, not a bug.
    await expect(
      waitForHttp('http://127.0.0.1:1/health', { timeoutMs: 150, intervalMs: 50 }),
    ).rejects.toThrow(WaitError);
  });

  it('stops immediately when the process it waits for is already dead', async () => {
    const dead = /** @type {import('node:child_process').ChildProcess} */ (
      /** @type {unknown} */ ({ exitCode: 2, signalCode: null })
    );

    const failure = await rejection(
      waitForHttp('http://127.0.0.1:1/health', {
        proc: dead,
        timeoutMs: 600_000,
      }),
    );

    expect(failure.died).toBe(true);
  });
});
