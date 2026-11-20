import type { Clock } from '@domain/shared';

/** Why a listing came back partial, if it did. */
export type LocateTruncation = { readonly reason: 'limit' | 'timeout' } | null;

export interface LocateCacheEntry {
  readonly paths: readonly string[];
  readonly truncated: LocateTruncation;
  /** Paths ripgrep returned that could not be decoded as UTF-8 — omitted, not garbled (S-63). */
  readonly skipped: number;
}

/** One cold listing in flight, and how many live callers still care about its result (S-62). */
interface InFlight {
  readonly promise: Promise<LocateCacheEntry>;
  readonly controller: AbortController;
  waiters: number;
}

/**
 * The locator's path list, kept warm for one folder at a time — D-07.
 *
 * Keyed by **realpath**, and consulted only after the caller has already resolved the folder
 * through the allowlist: a folder that left it is never answered from here, because nothing ever
 * asks this cache before that resolution happens (S-58). Single-flight: two cold requests for the
 * same folder become one `rg --files`, never two (S-57).
 *
 * A cold listing carries its own callers' abort signals (S-62): each one that passes a [signal]
 * is a waiter, counted while it is attached and no longer once its own signal fires. The listing
 * itself is only ever aborted once every waiter that gave a signal has left it — a caller that
 * passes none is a permanent waiter, so the listing is never cancelled on its account, and nobody
 * still attached ever has it pulled out from under them.
 */
export class LocateCache {
  private readonly entries = new Map<string, { entry: LocateCacheEntry; expiresAt: number }>();
  private readonly inFlight = new Map<string, InFlight>();

  constructor(
    private readonly ttlMs: number,
    private readonly clock: Clock,
  ) {}

  async get(
    realpath: string,
    compute: (signal: AbortSignal) => Promise<LocateCacheEntry>,
    signal?: AbortSignal,
  ): Promise<LocateCacheEntry> {
    const fresh = this.freshEntry(realpath);
    if (fresh !== null) {
      return fresh;
    }

    let inFlight = this.inFlight.get(realpath);
    if (inFlight === undefined) {
      inFlight = this.startListing(realpath, compute);
      this.inFlight.set(realpath, inFlight);
    }

    this.attach(inFlight, signal);
    return inFlight.promise;
  }

  /** Drops a folder's entry — a folder that left the allowlist is never served stale (S-58). */
  invalidate(realpath: string): void {
    this.entries.delete(realpath);
  }

  private startListing(
    realpath: string,
    compute: (signal: AbortSignal) => Promise<LocateCacheEntry>,
  ): InFlight {
    const controller = new AbortController();
    const promise = compute(controller.signal)
      .then((entry) => {
        this.entries.set(realpath, {
          entry,
          expiresAt: this.clock.now().getTime() + this.ttlMs,
        });
        return entry;
      })
      .finally(() => {
        this.inFlight.delete(realpath);
      });

    return { promise, controller, waiters: 0 };
  }

  /** `signal` becomes a waiter of `inFlight` — permanently, if it gives none at all (S-62). */
  private attach(inFlight: InFlight, signal?: AbortSignal): void {
    inFlight.waiters += 1;
    if (signal === undefined) {
      return;
    }
    if (signal.aborted) {
      this.detach(inFlight);
      return;
    }
    signal.addEventListener('abort', () => this.detach(inFlight), { once: true });
  }

  /** The last waiter leaving kills the listing nobody is left to read (S-62). */
  private detach(inFlight: InFlight): void {
    inFlight.waiters -= 1;
    if (inFlight.waiters <= 0) {
      inFlight.controller.abort();
    }
  }

  private freshEntry(realpath: string): LocateCacheEntry | null {
    const cached = this.entries.get(realpath);
    if (cached === undefined) {
      return null;
    }
    return cached.expiresAt > this.clock.now().getTime() ? cached.entry : null;
  }
}
