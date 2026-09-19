import type { CancelScheduled, Scheduler } from '@application/shared';

/** One task waiting for its delay to pass. */
interface Scheduled {
  readonly delayMs: number;
  readonly task: () => void;
  cancelled: boolean;
}

/**
 * A scheduler the test drives by hand.
 *
 * The deadline it stands in for is two minutes long, and a suite that waited for it would take two
 * minutes per case. Firing it explicitly also makes the **order** observable, which matters: a
 * timeout that lands on a request somebody has already answered is the bug this design exists to
 * prevent, and it is only visible if a test can make the two happen in a chosen order.
 */
export class ManualScheduler implements Scheduler {
  private readonly scheduled: Scheduled[] = [];

  after(delayMs: number, task: () => void): CancelScheduled {
    const entry: Scheduled = { delayMs, task, cancelled: false };
    this.scheduled.push(entry);

    return () => {
      entry.cancelled = true;
    };
  }

  /** How many deadlines are still armed. */
  get armed(): number {
    return this.scheduled.filter((entry) => !entry.cancelled).length;
  }

  /** The delays asked for, in order, cancelled ones included. */
  get delays(): number[] {
    return this.scheduled.map((entry) => entry.delayMs);
  }

  /** The delays of the deadlines that were called off before they could fire. */
  get cancelledDelays(): number[] {
    return this.scheduled.filter((entry) => entry.cancelled).map((entry) => entry.delayMs);
  }

  /** Runs every deadline that is still armed, oldest first. */
  fire(): void {
    for (const entry of [...this.scheduled]) {
      if (!entry.cancelled) {
        entry.cancelled = true;
        entry.task();
      }
    }
  }
}
