import type { RateLimitWindow } from '@domain/engines/claude';

export const RATE_LIMIT_STORE = Symbol('RateLimitStore');

/**
 * The latest reading of each rate-limit window the account's sessions report (plan 16, D-09). The
 * account is the machine's — every session of every user updates and reads the same state, which is
 * why there is no `userId` here.
 *
 * In-memory only in this cut: a restart forgets what was last seen until the next
 * `rate_limit_event` arrives, same as a machine where no session has run since boot. Plan 16, F1
 * (not started) is where this survives a restart, if it ever needs to.
 */
export interface RateLimitStore {
  observe(window: RateLimitWindow): void;

  /** Every window last observed, one entry per `kind` — the most recent reading replaces the last. */
  current(): readonly RateLimitWindow[];
}
