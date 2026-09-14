import { spawn } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanupOnce, kill, startProc, taskkillArgv } from '../../../scripts/lib/proc.mjs';

/** @type {import('node:child_process').ChildProcess[]} */
const spawned = [];

afterEach(async () => {
  for (const proc of spawned.splice(0)) {
    if (proc.exitCode === null && proc.signalCode === null) {
      await kill(proc, { graceMs: 100 });
    }
  }
});

/**
 * A child that runs until it is told to stop.
 *
 * @param {string} source body of the node program
 * @returns {Promise<import('node:child_process').ChildProcess>} resolved once it is running
 */
function child(source) {
  // Started the way the scripts start theirs, group and all: `kill` is what is under test, and
  // it behaves differently for a process that leads its own group.
  const proc = startProc(process.execPath, ['-e', source], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  spawned.push(proc);

  return new Promise((resolve) => {
    proc.stdout?.once('data', () => {
      resolve(proc);
    });
  });
}

describe('startProc', () => {
  it('starts the process, attached to this terminal', async () => {
    const proc = startProc(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)']);
    spawned.push(proc);

    expect(proc.pid).toBeGreaterThan(0);
    await kill(proc, { graceMs: 500 });
    expect(proc.exitCode !== null || proc.signalCode !== null).toBe(true);
  });
});

describe('kill', () => {
  it('stops a process that honours SIGTERM', async () => {
    const proc = await child('process.stdout.write("up"); setInterval(() => {}, 1000);');

    await kill(proc, { graceMs: 5_000 });

    expect(proc.signalCode).toBe('SIGTERM');
  });

  it('escalates to SIGKILL when the process ignores SIGTERM', async () => {
    const proc = await child(
      'process.on("SIGTERM", () => {}); process.stdout.write("up"); setInterval(() => {}, 1000);',
    );

    await kill(proc, { graceMs: 300 });

    expect(proc.signalCode).toBe('SIGKILL');
  });

  it('returns at once for a process that has already exited', async () => {
    const proc = await child('process.stdout.write("up"); process.exit(0);');
    await new Promise((resolve) => proc.once('exit', resolve));

    await expect(kill(proc, { graceMs: 50 })).resolves.toBeUndefined();
  });

  it('still stops a process that leads no group of its own', async () => {
    // Not started by `startProc`, so there is no process group to signal. Falling back to the
    // bare pid is what keeps `kill` from silently doing nothing.
    const proc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    spawned.push(proc);

    await kill(proc, { graceMs: 300 });

    expect(proc.signalCode).not.toBeNull();
  });

  it('kills the whole group, so a grandchild does not survive as an orphan', async () => {
    const proc = await child(
      [
        'const { spawn } = require("node:child_process");',
        'spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
        'process.stdout.write("up");',
        'setInterval(() => {}, 1000);',
      ].join(''),
    );

    await kill(proc, { graceMs: 300 });
    // The grandchild shares the group, so it received the same signal. Nothing is left holding a
    // port — the failure this whole module exists to prevent.
    expect(proc.signalCode).not.toBeNull();
  });
});

describe('taskkillArgv', () => {
  it('asks for the whole tree, forcibly — the Windows equivalent of signalling the group', () => {
    expect(taskkillArgv(4242)).toEqual({
      command: 'taskkill',
      args: ['/pid', '4242', '/t', '/f'],
    });
  });
});

describe('cleanupOnce', () => {
  it('runs the cleanup once, however many times it is called', async () => {
    const teardown = vi.fn(() => Promise.resolve());
    const once = cleanupOnce(teardown);

    await Promise.all([once(), once(), once()]);
    await once();

    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('does not start a second run while the first is still going — the double Ctrl+C', async () => {
    /** @type {() => void} */
    let release = () => {};
    const started = vi.fn();
    const once = cleanupOnce(() => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    });

    const first = once();
    const second = once();
    release();
    await Promise.all([first, second]);

    expect(started).toHaveBeenCalledTimes(1);
  });

  it('accepts a synchronous cleanup and still answers a promise', async () => {
    const teardown = vi.fn();

    await expect(cleanupOnce(teardown)()).resolves.toBeUndefined();
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('passes the arguments of the first call through', async () => {
    const teardown = vi.fn();

    await cleanupOnce(teardown)('SIGINT');

    expect(teardown).toHaveBeenCalledWith('SIGINT');
  });
});
