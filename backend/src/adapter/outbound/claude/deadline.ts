import type { Scheduler } from '@application/shared';

/**
 * `work`, or the error `timedOut` builds once `timeoutMs` has passed — whichever comes first.
 *
 * Every call that leaves the process has an explicit deadline
 * (docs/architecture/shared/04-errors-and-http.md), and the calls of this folder leave it for a
 * subprocess of the CLI. The deadline stops the **caller** waiting; it cannot stop the SDK, which
 * keeps working until it settles on its own.
 *
 * A rejection that is not an `Error` is wrapped in one, so every caller can hand it to the logger
 * as `err` and get a stack.
 */
export function withinDeadline<T>(
  scheduler: Scheduler,
  timeoutMs: number,
  work: Promise<T>,
  timedOut: () => Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = scheduler.after(timeoutMs, () => {
      reject(timedOut());
    });

    work.then(
      (value) => {
        cancel();
        resolve(value);
      },
      (error: unknown) => {
        cancel();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
