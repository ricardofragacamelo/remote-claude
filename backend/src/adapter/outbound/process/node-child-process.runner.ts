import { Inject, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';

import {
  ProcessAbortedError,
  type ProcessCommand,
  type ProcessOutcome,
  type ProcessRun,
  type ProcessRunner,
} from '@application/search';
import { LOGGER, type Logger } from '@shared/logging/logger';

/** What spawning a child needs — the one seam a unit test replaces to fake `child_process`. */
export type Spawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

/** How long `SIGTERM` is given before `SIGKILL` follows — ADR-016. */
export const KILL_GRACE_MS = 2000;

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/**
 * A pull-based queue: pushed from the child's `data` events, read by the caller's `for await`.
 *
 * Always ends cleanly, never by throwing: whether the run succeeded, timed out, was truncated,
 * failed or was aborted is the `outcome` promise's story to tell, once, after the lines are
 * drained — not a second, racing source of the same answer.
 */
class LineQueue {
  private readonly buffered: Buffer[] = [];
  private readonly waiting: ((result: IteratorResult<Buffer>) => void)[] = [];
  private closed = false;

  push(line: Buffer): void {
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: line, done: false });
    } else {
      this.buffered.push(line);
    }
  }

  finish(): void {
    this.closed = true;
    while (this.waiting.length > 0) {
      this.waiting.shift()?.({ value: undefined, done: true });
    }
  }

  private next(): Promise<IteratorResult<Buffer>> {
    const line = this.buffered.shift();
    if (line !== undefined) {
      return Promise.resolve({ value: line, done: false });
    }
    return this.closed
      ? Promise.resolve({ value: undefined, done: true })
      : new Promise((resolve) => this.waiting.push(resolve));
  }

  readonly [Symbol.asyncIterator] = (): AsyncIterator<Buffer> => ({ next: () => this.next() });
}

/** Strips one trailing `\r`, the way a line split on `\n` alone still reads right on Windows. */
function withoutTrailingCarriageReturn(line: Buffer): Buffer {
  const last = line.length - 1;
  return last >= 0 && line[last] === CARRIAGE_RETURN ? line.subarray(0, last) : line;
}

/**
 * The one adapter that imports `node:child_process` for a subprocess of search — ADR-016.
 *
 * Argv is always an array and `shell` is always `false`; the caller already resolved the binary
 * to an absolute path and built the allow-listed `env`. What this class owns is everything about
 * *running* the child safely: a deadline that escalates from `SIGTERM` to `SIGKILL`, a byte cap
 * that kills the child rather than growing memory without bound, an `AbortSignal` that kills it
 * the moment the request that asked for it goes away, and stdout delivered line by line, in raw
 * bytes, as soon as each line is complete — never buffered whole, and never the child's own
 * encoding guess.
 */
@Injectable()
export class NodeChildProcessRunner implements ProcessRunner {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly spawnChild: Spawn = spawn,
  ) {}

  run(command: ProcessCommand): ProcessRun {
    const startedAt = Date.now();
    const queue = new LineQueue();
    let bytesRead = 0;
    let truncated = false;
    let timedOut = false;
    let aborted = false;
    let killTimer: NodeJS.Timeout | null = null;

    const child = this.spawnChild(command.binary, command.args, {
      cwd: command.cwd,
      env: command.env,
      shell: false,
    });

    const isAlive = (): boolean => child.exitCode === null && child.signalCode === null;

    const terminate = (): void => {
      if (!isAlive()) {
        return;
      }
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (isAlive()) {
          child.kill('SIGKILL');
        }
      }, KILL_GRACE_MS);
    };

    // Always set, synchronously, before `settle` can possibly run — never nullable, unlike
    // `killTimer`, which exists only once `terminate` has actually run.
    const deadlineTimer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, command.timeoutMs);

    const onAbort = (): void => {
      aborted = true;
      terminate();
    };
    command.signal?.addEventListener('abort', onAbort, { once: true });

    // Closed whether or not there is anything to send — a child that reads stdin never hangs
    // waiting for input it was never going to receive (S-14).
    child.stdin.end(command.stdin ?? '');

    let carry = Buffer.alloc(0);

    child.stdout.on('data', (chunk: Buffer) => {
      bytesRead += chunk.length;
      if (bytesRead > command.maxBytes && !truncated) {
        truncated = true;
        terminate();
      }
      carry = Buffer.concat([carry, chunk]);
      let newlineAt = carry.indexOf(NEWLINE);
      while (newlineAt !== -1) {
        queue.push(withoutTrailingCarriageReturn(carry.subarray(0, newlineAt)));
        carry = carry.subarray(newlineAt + 1);
        newlineAt = carry.indexOf(NEWLINE);
      }
    });

    const outcome = new Promise<ProcessOutcome>((resolve, reject) => {
      const settle = (exitCode: number | null, error: Error | null): void => {
        clearTimeout(deadlineTimer);
        if (killTimer !== null) clearTimeout(killTimer);
        command.signal?.removeEventListener('abort', onAbort);
        if (carry.length > 0) {
          queue.push(withoutTrailingCarriageReturn(carry));
          carry = Buffer.alloc(0);
        }

        const result: ProcessOutcome = {
          exitCode,
          durationMs: Date.now() - startedAt,
          bytesRead,
          truncated,
          timedOut,
          aborted,
        };

        this.logger.debug(
          {
            op: 'search.process',
            layer: 'adapter',
            label: command.label,
            binary: command.binary,
            cwd: command.cwd,
            ...result,
          },
          'subprocess finished',
        );

        queue.finish();

        if (aborted) {
          reject(new ProcessAbortedError());
        } else if (error === null) {
          resolve(result);
        } else {
          reject(error);
        }
      };

      child.on('error', (error) => settle(null, error));
      child.on('close', (exitCode) => settle(exitCode, null));
    });

    return { lines: queue, outcome };
  }
}
