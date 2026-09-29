import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { waitFor } from '../../../support/app/wait-for';

/**
 * `SIGHUP` from the operating system — not an emitted event — to a process with the reload wired
 * in: it reloads and it stays up. Without the listener Node would end the process on this signal,
 * which is exactly what `pnpm allowlist add` must never do to a running backend (plan 06, S-180).
 */
describe('a real SIGHUP', () => {
  let child: ChildProcess | null = null;

  afterEach(() => {
    child?.kill('SIGTERM');
    child = null;
  });

  it('reloads the allowlist and leaves the process running', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'rc-signal-'));
    const first = path.join(directory, 'first');
    const second = path.join(directory, 'second');
    const file = path.join(directory, 'allowlist.yaml');
    mkdirSync(first);
    mkdirSync(second);
    const declare = (roots: readonly string[]) => {
      writeFileSync(
        file,
        `roots:\n${roots.map((root) => `  - { path: ${root}, label: x, users: [auth|42] }\n`).join('')}`,
        'utf8',
      );
    };
    declare([first]);

    const output: string[] = [];
    // One process, loader and all: `tsx` as a command would sit in between as a parent, and the
    // signal would reach it rather than the program — the very trap D-15 sends the signal around.
    const program = spawn(
      process.execPath,
      ['--import', 'tsx', 'test/support/processes/allowlist-signal-child.ts', file],
      { cwd: path.resolve(__dirname, '../../../..'), stdio: ['ignore', 'pipe', 'inherit'] },
    );
    child = program;
    program.stdout.on('data', (chunk: Buffer) => {
      output.push(...chunk.toString('utf8').split('\n'));
    });

    await waitFor(
      'the child to be ready',
      () => Promise.resolve(output),
      (lines) => lines.includes('ready'),
      15_000,
    );
    declare([first, second]);
    program.kill('SIGHUP');

    await waitFor(
      'the reload to be logged',
      () => Promise.resolve(output),
      (lines) => lines.some((line) => line.includes('"allowlist.reloaded"')),
      15_000,
    );
    const reloaded = JSON.parse(
      output.find((line) => line.includes('"allowlist.reloaded"')) ?? '{}',
    ) as { added?: string[] };

    expect(reloaded.added).toEqual([second]);
    expect(program.exitCode).toBeNull();
    expect(program.signalCode).toBeNull();
  });
});
