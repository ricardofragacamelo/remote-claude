import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { NodeChildProcessRunner } from '@adapter/outbound/process/node-child-process.runner';
import type { ProcessCommand } from '@application/search';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB = join(HERE, '../../../../fixtures/process/argv-echo.mjs');

function commandOf(overrides: Partial<ProcessCommand> = {}): ProcessCommand {
  return {
    binary: process.execPath,
    args: [STUB],
    cwd: HERE,
    env: { PATH: process.env['PATH'] ?? '' },
    label: 'integration',
    timeoutMs: 5000,
    maxBytes: 10_000_000,
    ...overrides,
  };
}

async function firstLine(lines: AsyncIterable<Buffer>): Promise<{ argv: string[]; env: object }> {
  for await (const line of lines) {
    return JSON.parse(line.toString('utf8')) as { argv: string[]; env: object };
  }
  throw new Error('the stub produced no output');
}

describe('NodeChildProcessRunner against a real subprocess — ADR-016', () => {
  it('passes a hostile argument through untouched — S-06', async () => {
    const runner = new NodeChildProcessRunner(new RecordingLogger().logger);
    const hostile = ['$(touch sentinel)', '; rm -rf /', '`id`', 'a|b', 'x&&y', '--flag=-e'];
    const { lines, outcome } = runner.run(commandOf({ args: [STUB, ...hostile] }));

    const echoed = await firstLine(lines);
    await outcome;

    expect(echoed.argv).toEqual(hostile);
  });

  it('gives the child only the allow-listed environment — S-07', async () => {
    const runner = new NodeChildProcessRunner(new RecordingLogger().logger);
    const { lines, outcome } = runner.run(
      commandOf({ env: { PATH: '/usr/bin', LANG: 'C', HOME: '/home/nobody' } }),
    );

    const echoed = await firstLine(lines);
    await outcome;

    expect(echoed.env).toEqual({ PATH: '/usr/bin', LANG: 'C', HOME: '/home/nobody' });
    expect(echoed.env).not.toHaveProperty('RC_DATABASE_URL');
  });

  it('kills a child that outlives its deadline — S-08', async () => {
    const runner = new NodeChildProcessRunner(new RecordingLogger().logger);
    const { lines, outcome } = runner.run(
      commandOf({
        timeoutMs: 500,
        env: { ...commandOf().env, STUB_SLEEP_MS: '60000', STUB_IGNORE_SIGTERM: '1' },
      }),
    );

    await firstLine(lines);
    const result = await outcome;

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  }, 10_000);

  it('closes stdin so a child reading it never hangs — S-14', async () => {
    const runner = new NodeChildProcessRunner(new RecordingLogger().logger);
    const { lines, outcome } = runner.run(commandOf());

    await firstLine(lines);
    const result = await outcome;

    expect(result.exitCode).toBe(0);
  });

  it('runs fifty subprocesses at once without mixing their output — S-13', async () => {
    const runner = new NodeChildProcessRunner(new RecordingLogger().logger);
    const runs = Array.from({ length: 50 }, (_, index) =>
      runner.run(commandOf({ args: [STUB, `marker-${String(index)}`] })),
    );

    const results = await Promise.all(
      runs.map(async ({ lines, outcome }) => {
        const echoed = await firstLine(lines);
        await outcome;
        return echoed.argv[0];
      }),
    );

    expect(results).toEqual(Array.from({ length: 50 }, (_, index) => `marker-${String(index)}`));
  });

  it('nothing is left running once the deadline kills it — no orphan process', async () => {
    const marker = `no-orphan-${String(process.pid)}-${String(Date.now())}`;
    const runner = new NodeChildProcessRunner(new RecordingLogger().logger);
    const { lines, outcome } = runner.run(
      commandOf({
        args: [STUB, marker],
        timeoutMs: 500,
        env: { ...commandOf().env, STUB_SLEEP_MS: '60000', STUB_IGNORE_SIGTERM: '1' },
      }),
    );
    await firstLine(lines);
    await outcome;

    // Bracketing the first character keeps `pgrep`'s own argv — which necessarily quotes this
    // same pattern — from matching its own search (the classic `ps | grep '[x]yz'` trick).
    const pattern = `[${marker.charAt(0)}]${marker.slice(1)}`;
    const survivors = execSync(`pgrep -f "${pattern}" || true`).toString().trim();
    expect(survivors).toBe('');
  }, 10_000);
});
