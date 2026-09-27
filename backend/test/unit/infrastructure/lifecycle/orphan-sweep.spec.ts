import { beforeEach, describe, expect, it } from 'vitest';

import { OWNER_VALUE, PROCESS_MARKER } from '@adapter/outbound/claude/process-marker';
import { ORPHAN_GRACE_MS, OrphanSweep, orphansIn } from '@infra/lifecycle/orphan-sweep';
import type { ProcessEntry, ProcessTable } from '@infra/lifecycle/process-table';
import { RecordingLogger } from '../../../support/fakes/recording-logger';
import { SystemScheduler } from '@shared/time/system-scheduler';

const SELF = 1_000;
const DEAD_BACKEND = 900;
const LIVE_BACKEND = 950;

/** A process with the environment a test gives it. */
const aProcess = (pid: number, environment: Readonly<Record<string, string>>): ProcessEntry => ({
  pid,
  environment: new Map(Object.entries(environment)),
});

/** One of ours, started by `parent`. */
const ours = (pid: number, parent: number | string): ProcessEntry =>
  aProcess(pid, {
    [PROCESS_MARKER.owner]: OWNER_VALUE,
    [PROCESS_MARKER.parentPid]: String(parent),
  });

const alive = (pid: number): boolean => pid === SELF || pid === LIVE_BACKEND;

describe('orphansIn — B-03', () => {
  it('finds a subprocess of ours whose backend is dead — S-06', () => {
    expect(orphansIn([ours(10, DEAD_BACKEND)], SELF, alive).map(({ pid }) => pid)).toEqual([10]);
  });

  it("leaves a process with no mark — the user's own Claude Code — S-07", () => {
    expect(orphansIn([aProcess(11, { PATH: '/usr/bin' })], SELF, alive)).toEqual([]);
  });

  it("leaves a process whose mark has somebody else's value — S-07", () => {
    const impostor = aProcess(12, {
      [PROCESS_MARKER.owner]: 'someone-else',
      [PROCESS_MARKER.parentPid]: String(DEAD_BACKEND),
    });

    expect(orphansIn([impostor], SELF, alive)).toEqual([]);
  });

  it('leaves a subprocess of a backend that is still running — S-07', () => {
    expect(orphansIn([ours(13, LIVE_BACKEND)], SELF, alive)).toEqual([]);
  });

  it('never sweeps its own subprocesses, nor itself', () => {
    expect(orphansIn([ours(14, SELF), ours(SELF, DEAD_BACKEND)], SELF, alive)).toEqual([]);
  });

  it.each(['', 'nope', '0', '-3', '1.5'])('leaves a mark whose parent is %j', (parent) => {
    expect(orphansIn([ours(15, parent)], SELF, alive)).toEqual([]);
  });
});

/** A process table the test controls: who exists, and what was signalled. */
class FakeTable implements ProcessTable {
  readonly signals: { pid: number; signal: string }[] = [];
  readonly stubborn = new Set<number>();
  living: Set<number>;

  constructor(
    private readonly entries: readonly ProcessEntry[] | null,
    living: readonly number[] = [],
  ) {
    this.living = new Set([SELF, LIVE_BACKEND, ...living]);
  }

  list(): Promise<readonly ProcessEntry[] | null> {
    return Promise.resolve(this.entries);
  }

  isAlive(pid: number): boolean {
    return this.living.has(pid);
  }

  signal(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
    this.signals.push({ pid, signal });
    if (signal === 'SIGKILL' || !this.stubborn.has(pid)) {
      this.living.delete(pid);
    }
  }
}

describe('OrphanSweep — B-03', () => {
  let logger: RecordingLogger;

  beforeEach(() => {
    logger = new RecordingLogger();
  });

  const sweep = (table: ProcessTable): OrphanSweep =>
    new OrphanSweep(table, new SystemScheduler(), logger.logger, SELF);

  it('ends an orphan with SIGTERM, and says which — S-06', async () => {
    const table = new FakeTable([ours(10, DEAD_BACKEND), ours(11, LIVE_BACKEND)], [10, 11]);

    expect(await sweep(table).sweep()).toBe(1);
    expect(table.signals).toEqual([{ pid: 10, signal: 'SIGTERM' }]);
    expect(logger.withOp('session.orphanSweep')).toEqual([
      expect.objectContaining({ level: 'warn', ended: 1, pids: [10] }),
    ]);
  });

  it(
    'sends SIGKILL to one that ignored SIGTERM through the grace period',
    async () => {
      const table = new FakeTable([ours(10, DEAD_BACKEND)], [10]);
      table.stubborn.add(10);

      await sweep(table).sweep();

      expect(table.signals).toEqual([
        { pid: 10, signal: 'SIGTERM' },
        { pid: 10, signal: 'SIGKILL' },
      ]);
    },
    ORPHAN_GRACE_MS * 3,
  );

  it('says quietly that there was nothing to end', async () => {
    expect(await sweep(new FakeTable([])).sweep()).toBe(0);
    expect(logger.withOp('session.orphanSweep')).toEqual([
      expect.objectContaining({ level: 'debug', ended: 0 }),
    ]);
  });

  it('says it could not look, rather than that it found nothing', async () => {
    expect(await sweep(new FakeTable(null)).sweep()).toBeNull();
    expect(logger.withOp('session.orphanSweep')).toEqual([
      expect.objectContaining({ level: 'warn', msg: 'orphan sweep unavailable on this platform' }),
    ]);
  });

  it('never stops the boot over a sweep that failed', async () => {
    const broken: ProcessTable = {
      list: () => Promise.reject(new Error('no /proc for you')),
      isAlive: () => false,
      signal: () => undefined,
    };

    await expect(sweep(broken).onApplicationBootstrap()).resolves.toBeUndefined();
    expect(logger.withOp('session.orphanSweep')).toEqual([
      expect.objectContaining({ level: 'error' }),
    ]);
  });
});
