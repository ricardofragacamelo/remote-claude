import type { CancelScheduled, Scheduler } from '@application/shared';

/**
 * `setTimeout`, behind the port.
 *
 * The only place in the backend that arms a timer, for the same reason `SystemClock` is the only
 * place that reads the wall clock: a use case that called `setTimeout` itself could only be tested
 * by waiting, and the deadline this exists for is two minutes long.
 *
 * `unref()` so a pending permission cannot keep the process alive on its way out. A backend that
 * refused to exit for two minutes after a shutdown would be a backend nobody restarts willingly.
 */
export class SystemScheduler implements Scheduler {
  after(delayMs: number, task: () => void): CancelScheduled {
    // Never synchronously, even for a deadline already past: settling a request before its caller
    // has finished creating it would be a resolution arriving before the question.
    const timer = setTimeout(task, Math.max(0, delayMs));
    timer.unref();

    return () => {
      clearTimeout(timer);
    };
  }
}
