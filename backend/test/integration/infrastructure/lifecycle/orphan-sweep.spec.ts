import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import { OWNER_VALUE, PROCESS_MARKER } from '@adapter/outbound/claude/process-marker';
import { OrphanSweep } from '@infra/lifecycle/orphan-sweep';
import { ProcfsProcessTable } from '@infra/lifecycle/process-table';
import { SystemScheduler } from '@shared/time/system-scheduler';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

/** A process that does nothing until it is told to stop — what an idle CLI looks like from here. */
function aSleeper(environment: Readonly<Record<string, string>>): ChildProcess {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 60_000)'], {
    env: { ...process.env, ...environment },
    stdio: 'ignore',
  });
}

/** The pid of a process that has already exited: the backend that died without its shutdown. */
async function aDeadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise((resolve) => child.on('exit', resolve));

  return child.pid ?? 0;
}

/** Resolves with the signal a process exited on. */
function exitOf(child: ChildProcess): Promise<NodeJS.Signals | null> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.signalCode);
      return;
    }
    child.on('exit', (_code, signal) => resolve(signal));
  });
}

/** Resolves once a process can be seen in the table with its environment. */
async function visible(child: ChildProcess, table: ProcfsProcessTable): Promise<void> {
  for (;;) {
    const entries = (await table.list()) ?? [];
    if (entries.some((entry) => entry.pid === child.pid && entry.environment.size > 0)) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * The boot sweep against real processes on this machine — B-03.
 *
 * The rule itself is proved with numbers in the unit suite. What only a real process table can
 * prove is the rest: that the mark actually reaches `/proc/<pid>/environ`, that a signal actually
 * ends the process, and that a process without the mark is left exactly as it was.
 */
describe.runIf(process.platform === 'linux')('the orphan sweep, on real processes', () => {
  const spawned: ChildProcess[] = [];

  afterEach(() => {
    for (const child of spawned.splice(0)) {
      child.kill('SIGKILL');
    }
  });

  const sweep = (logger = new RecordingLogger()): OrphanSweep =>
    new OrphanSweep(new ProcfsProcessTable(), new SystemScheduler(), logger.logger);

  it('ends a CLI subprocess left by a backend that died — S-06', async () => {
    const orphan = aSleeper({
      [PROCESS_MARKER.owner]: OWNER_VALUE,
      [PROCESS_MARKER.parentPid]: String(await aDeadPid()),
    });
    spawned.push(orphan);
    await visible(orphan, new ProcfsProcessTable());

    const ended = await sweep().sweep();

    expect(ended).toBeGreaterThanOrEqual(1);
    await expect(exitOf(orphan)).resolves.toBe('SIGTERM');
  });

  it('leaves a process without the mark — the Claude Code the user has open — S-07', async () => {
    const theirs = aSleeper({ SOME_OTHER_VARIABLE: 'claude' });
    spawned.push(theirs);
    await visible(theirs, new ProcfsProcessTable());

    await sweep().sweep();

    expect(theirs.exitCode).toBeNull();
    expect(theirs.signalCode).toBeNull();
  });

  it('leaves a subprocess of a backend that is still running — S-07', async () => {
    const sibling = aSleeper({
      [PROCESS_MARKER.owner]: OWNER_VALUE,
      // The test runner stands in for a second backend that is alive.
      [PROCESS_MARKER.parentPid]: String(process.ppid),
    });
    spawned.push(sibling);
    await visible(sibling, new ProcfsProcessTable());

    await sweep().sweep();

    expect(sibling.exitCode).toBeNull();
    expect(sibling.signalCode).toBeNull();
  });
});
