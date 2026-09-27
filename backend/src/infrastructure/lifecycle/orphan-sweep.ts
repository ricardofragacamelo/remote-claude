import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';

import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { OWNER_VALUE, PROCESS_MARKER } from '@adapter/outbound/claude/process-marker';
import { LOGGER, type Logger } from '@shared/logging/logger';
import type { ProcessEntry, ProcessTable } from './process-table';

/**
 * The processes that are ours and whose backend is gone.
 *
 * Three conditions, all of them required, because the cost of a false positive is killing
 * something on the user's machine that was not ours to kill (S-07):
 *
 * - **the mark, with our value** — a process merely named `claude` is not enough, and neither is a
 *   variable that happens to share the name;
 * - **not this process** — the backend does not sweep itself;
 * - **its backend is dead** — a mark naming a live backend is a sibling installation's session (a
 *   second checkout, the e2e stack), and it is alive for a reason.
 *
 * A pid that was reused by an unrelated process after the backend died reads as alive, and the
 * orphan is left — the safe direction to be wrong in.
 */
export function orphansIn(
  entries: readonly ProcessEntry[],
  selfPid: number,
  isAlive: (pid: number) => boolean,
): ProcessEntry[] {
  return entries.filter((entry) => {
    if (entry.pid === selfPid || entry.environment.get(PROCESS_MARKER.owner) !== OWNER_VALUE) {
      return false;
    }

    const parent = Number(entry.environment.get(PROCESS_MARKER.parentPid));

    return Number.isInteger(parent) && parent > 0 && parent !== selfPid && !isAlive(parent);
  });
}

/** How long an orphan has to stop on `SIGTERM` before it gets `SIGKILL`. */
export const ORPHAN_GRACE_MS = 2_000;

/** How often the sweep looks whether an orphan has stopped yet. */
export const ORPHAN_POLL_MS = 50;

/**
 * On the way up, finds the CLI subprocesses a dead backend left behind and ends them — B-03.
 *
 * The CLI survives its parent (measured), so a backend killed without running its shutdown leaves
 * ~222 MB per session running for nobody until the machine reboots. This runs once per boot, before
 * any session of this backend exists, so everything it finds is an earlier backend's.
 *
 * It never stops the boot. A sweep that failed is logged; a backend that refused to start because
 * it could not tidy up after a predecessor would trade the product for its housekeeping.
 */
@Injectable()
export class OrphanSweep implements OnApplicationBootstrap {
  constructor(
    private readonly table: ProcessTable,
    @Inject(SCHEDULER) private readonly scheduler: Scheduler,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly selfPid: number = process.pid,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sweep();
  }

  /** @returns how many orphans were ended, or `null` when this platform cannot be asked */
  async sweep(): Promise<number | null> {
    const context = { op: 'session.orphanSweep', layer: 'infrastructure', module: 'session' };

    try {
      const entries = await this.table.list();

      if (entries === null) {
        this.logger.warn(context, 'orphan sweep unavailable on this platform');
        return null;
      }

      const orphans = orphansIn(entries, this.selfPid, (pid) => this.table.isAlive(pid));
      await Promise.all(orphans.map((orphan) => this.end(orphan.pid)));

      const line = { ...context, ended: orphans.length, pids: orphans.map(({ pid }) => pid) };
      if (orphans.length > 0) {
        this.logger.warn(line, 'ended CLI subprocesses left behind by a previous backend');
      } else {
        this.logger.debug(line, 'no orphaned CLI subprocess found');
      }

      return orphans.length;
    } catch (error) {
      this.logger.error({ ...context, err: error }, 'the orphan sweep failed');
      return 0;
    }
  }

  /** `SIGTERM`, a grace period, and `SIGKILL` for one that did not listen. */
  private async end(pid: number): Promise<void> {
    this.table.signal(pid, 'SIGTERM');

    for (let waited = 0; waited < ORPHAN_GRACE_MS; waited += ORPHAN_POLL_MS) {
      if (!this.table.isAlive(pid)) {
        return;
      }

      await this.pause(ORPHAN_POLL_MS);
    }

    this.table.signal(pid, 'SIGKILL');
  }

  private pause(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.scheduler.after(delayMs, resolve);
    });
  }
}
