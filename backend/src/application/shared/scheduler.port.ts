/** Cancels a scheduled call. Calling it after the call has run is a no-op. */
export type CancelScheduled = () => void;

/**
 * Where a deadline comes from.
 *
 * The same reason `Clock` exists: a use case that called `setTimeout` directly could only be
 * tested by waiting, and the deadline this port exists for is two minutes long. The real
 * implementation is three lines; what it buys is a permission timeout that can be exercised at
 * the instant it fires rather than approximately.
 */
export interface Scheduler {
  /**
   * Runs `task` after `delayMs`.
   *
   * A negative or zero delay runs it on the next turn, never synchronously: a deadline that had
   * already passed would otherwise settle a request before the caller had finished creating it.
   */
  after(delayMs: number, task: () => void): CancelScheduled;
}

export const SCHEDULER = Symbol('Scheduler');
