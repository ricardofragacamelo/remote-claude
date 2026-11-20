import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';

import { ProcessAbortedError } from '@application/search';
import type { ProcessCommand } from '@application/search';
import {
  KILL_GRACE_MS,
  NodeChildProcessRunner,
} from '../../../../../src/adapter/outbound/process/node-child-process.runner';
import type { Spawn } from '../../../../../src/adapter/outbound/process/node-child-process.runner';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

/** Records what it was told, and nothing more — the one seam the runner spawns through. */
class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stdinCalls: (string | undefined)[] = [];
  readonly stdin = { end: (data?: string): void => void this.stdinCalls.push(data) };
  readonly killSignals: string[] = [];
  exitCode: number | null = null;
  signalCode: string | null = null;

  /**
   * Records the signal, exactly as `ChildProcess#kill()` does — it does **not** set `signalCode`.
   * Node only sets that once the process has actually died from the signal, which is why a
   * `SIGTERM` the child ignores still leaves it "alive" until something else says otherwise.
   */
  kill(signal: string): boolean {
    this.killSignals.push(signal);
    return true;
  }

  /** The child exits — by its own code, or because a signal actually killed it. */
  close(exitCode: number | null, signal: string | null = null): void {
    this.exitCode = exitCode;
    this.signalCode = signal;
    this.emit('close', exitCode);
  }
}

interface SpawnCall {
  readonly binary: string;
  readonly args: readonly string[];
  readonly options: SpawnOptionsWithoutStdio;
}

function harness(): {
  runner: NodeChildProcessRunner;
  child: FakeChildProcess;
  calls: SpawnCall[];
  logger: RecordingLogger;
} {
  const child = new FakeChildProcess();
  const calls: SpawnCall[] = [];
  const spawnFake: Spawn = (binary, args, options) => {
    calls.push({ binary, args, options });
    return child as unknown as ChildProcessWithoutNullStreams;
  };
  const logger = new RecordingLogger();
  const runner = new NodeChildProcessRunner(logger.logger, spawnFake);

  return { runner, child, calls, logger };
}

function commandOf(overrides: Partial<ProcessCommand> = {}): ProcessCommand {
  return {
    binary: '/usr/bin/rg',
    args: ['--json', '--', 'pattern'],
    cwd: '/srv/project',
    env: { PATH: '/usr/bin' },
    label: 'search-text',
    timeoutMs: 30_000,
    maxBytes: 10_000_000,
    ...overrides,
  };
}

async function collect(lines: AsyncIterable<Buffer>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of lines) {
    out.push(line.toString('latin1'));
  }
  return out;
}

describe('NodeChildProcessRunner — ADR-016', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes argv as an array and shell: false, never a joined command string', () => {
    const { runner, child, calls } = harness();

    runner.run(commandOf());
    child.close(0);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.binary).toBe('/usr/bin/rg');
    expect(calls[0]?.args).toEqual(['--json', '--', 'pattern']);
    expect(calls[0]?.options.shell).toBe(false);
  });

  it('gives the child exactly the env it was handed, never the backend process’s own', () => {
    const { runner, child, calls } = harness();

    runner.run(commandOf({ env: { PATH: '/x', LANG: 'C' } }));
    child.close(0);

    expect(calls[0]?.options.env).toEqual({ PATH: '/x', LANG: 'C' });
  });

  it('closes stdin even when there is nothing to send — S-14', () => {
    const { runner, child } = harness();

    runner.run(commandOf());
    child.close(0);

    expect(child.stdinCalls).toEqual(['']);
  });

  it('writes stdin and closes it when given something to send', () => {
    const { runner, child } = harness();

    runner.run(commandOf({ stdin: 'hello' }));
    child.close(0);

    expect(child.stdinCalls).toEqual(['hello']);
  });

  it('delivers stdout line by line, reassembling a line split across chunks — S-16', async () => {
    const { runner, child } = harness();
    const { lines, outcome } = runner.run(commandOf());

    const collecting = collect(lines);
    child.stdout.emit('data', Buffer.from('ab'));
    child.stdout.emit('data', Buffer.from('c\ndef\n'));
    child.close(0);

    await expect(outcome).resolves.toMatchObject({ exitCode: 0 });
    expect(await collecting).toEqual(['abc', 'def']);
  });

  it('flushes a trailing line that never got its own newline', async () => {
    const { runner, child } = harness();
    const { lines, outcome } = runner.run(commandOf());

    const collecting = collect(lines);
    child.stdout.emit('data', Buffer.from('no-newline-at-eof'));
    child.close(0);

    await outcome;
    expect(await collecting).toEqual(['no-newline-at-eof']);
  });

  it('an empty line between two newlines stays empty, not a dropped \\r', async () => {
    const { runner, child } = harness();
    const { lines, outcome } = runner.run(commandOf());

    const collecting = collect(lines);
    child.stdout.emit('data', Buffer.from('a\n\nb\n'));
    child.close(0);

    await outcome;
    expect(await collecting).toEqual(['a', '', 'b']);
  });

  it('keeps raw bytes untouched — an invalid UTF-8 byte is never replaced — S-15', async () => {
    const { runner, child } = harness();
    const { lines, outcome } = runner.run(commandOf());

    const collecting = collect(lines);
    child.stdout.emit('data', Buffer.from([0xff, 0xfe, 0x0a]));
    child.close(0);

    await outcome;
    const [line] = await collecting.then((out) => [Buffer.from(out[0] ?? '', 'latin1')]);
    expect(line?.equals(Buffer.from([0xff, 0xfe]))).toBe(true);
  });

  it('escalates from SIGTERM to SIGKILL when the deadline passes — S-08', async () => {
    const { runner, child } = harness();
    const { outcome } = runner.run(commandOf({ timeoutMs: 1000 }));

    await vi.advanceTimersByTimeAsync(1000);
    expect(child.killSignals).toEqual(['SIGTERM']);

    await vi.advanceTimersByTimeAsync(KILL_GRACE_MS);
    expect(child.killSignals).toEqual(['SIGTERM', 'SIGKILL']);

    child.close(null);
    await expect(outcome).resolves.toMatchObject({ timedOut: true, exitCode: null });
  });

  it('does not escalate to SIGKILL when the child exits right after SIGTERM', async () => {
    const { runner, child } = harness();
    const { outcome } = runner.run(commandOf({ timeoutMs: 1000 }));

    await vi.advanceTimersByTimeAsync(1000);
    expect(child.killSignals).toEqual(['SIGTERM']);
    child.close(null);

    await vi.advanceTimersByTimeAsync(KILL_GRACE_MS);
    expect(child.killSignals).toEqual(['SIGTERM']);
    await expect(outcome).resolves.toMatchObject({ timedOut: true });
  });

  it('the kill timer itself skips SIGKILL if the child is already dead by the time it fires', async () => {
    const { runner, child } = harness();
    const { outcome } = runner.run(commandOf({ timeoutMs: 1000 }));

    await vi.advanceTimersByTimeAsync(1000);
    expect(child.killSignals).toEqual(['SIGTERM']);

    // The child died from the SIGTERM, but nothing told the runner yet — a real 'close' can lag
    // the OS by a tick. Set directly, bypassing `close()`'s own event, to isolate the kill
    // timer's own guard from `settle()`'s (which would otherwise clear the timer first).
    child.exitCode = 0;

    await vi.advanceTimersByTimeAsync(KILL_GRACE_MS);
    expect(child.killSignals).toEqual(['SIGTERM']);

    child.close(0);
    await outcome;
  });

  it('kills the child and marks the run truncated once the byte cap is passed — S-09', async () => {
    const { runner, child } = harness();
    const { outcome } = runner.run(commandOf({ maxBytes: 10 }));

    child.stdout.emit('data', Buffer.from('x'.repeat(20)));
    expect(child.killSignals).toEqual(['SIGTERM']);

    child.close(null);
    await expect(outcome).resolves.toMatchObject({ truncated: true, bytesRead: 20 });
  });

  it('kills the child on abort, and the outcome rejects as an abort, not a process failure — S-10', async () => {
    const { runner, child } = harness();
    const controller = new AbortController();
    const { outcome } = runner.run(commandOf({ signal: controller.signal }));

    controller.abort();
    expect(child.killSignals).toEqual(['SIGTERM']);

    const rejection = expect(outcome).rejects.toBeInstanceOf(ProcessAbortedError);
    child.close(null);
    await rejection;
  });

  it('an abort after the child already exited is harmless — S-17', async () => {
    const { runner, child } = harness();
    const controller = new AbortController();
    const { outcome } = runner.run(commandOf({ signal: controller.signal }));

    child.close(0);
    await outcome;

    controller.abort();
    expect(child.killSignals).toEqual([]);
  });

  it('rejects with the raw spawn failure for a binary that does not exist — S-11', async () => {
    const { runner, child } = harness();
    const { outcome } = runner.run(commandOf({ binary: '/does/not/exist' }));

    const failure = new Error('spawn ENOENT');
    child.emit('error', failure);

    await expect(outcome).rejects.toBe(failure);
  });

  it('logs the completion line without the pattern, the replacement or any file content — S-12', async () => {
    const { runner, child, logger } = harness();
    const { outcome } = runner.run(commandOf({ label: 'search-text' }));

    child.stdout.emit('data', Buffer.from('a secret pattern should never be logged\n'));
    child.close(0);
    await outcome;

    const [line] = logger.withOp('search.process');
    expect(line).toMatchObject({ label: 'search-text', exitCode: 0, truncated: false });
    expect(JSON.stringify(line)).not.toContain('secret pattern');
  });

  it('does not mix the output of two concurrent runs — S-13', async () => {
    const first = new FakeChildProcess();
    const second = new FakeChildProcess();
    const spawned = [first, second];
    const spawnFake: Spawn = () => spawned.shift() as unknown as ChildProcessWithoutNullStreams;
    const runner = new NodeChildProcessRunner(new RecordingLogger().logger, spawnFake);

    const runA = runner.run(commandOf({ label: 'a' }));
    const runB = runner.run(commandOf({ label: 'b' }));
    const collectingA = collect(runA.lines);
    const collectingB = collect(runB.lines);

    first.stdout.emit('data', Buffer.from('from-a\n'));
    second.stdout.emit('data', Buffer.from('from-b\n'));
    first.close(0);
    second.close(0);

    expect(await collectingA).toEqual(['from-a']);
    expect(await collectingB).toEqual(['from-b']);
  });
});
