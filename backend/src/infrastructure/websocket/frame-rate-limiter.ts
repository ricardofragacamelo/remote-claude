/** What one inbound frame gets: through, refused with `RATE_LIMITED`, or the socket closed. */
export type FrameVerdict = 'accepted' | 'refused' | 'repeated';

/**
 * The rate of one connection — a token bucket, with a memory of the last refusal.
 *
 * The bucket holds a second's worth of frames and refills continuously, so a client that sends a
 * burst and then goes quiet is never refused. Over it, the first frame is **refused** — an `error`
 * with a `Retry-After` — and any frame inside that back-off window is the client not having
 * listened: **repeated**, and the gateway closes with `4429` (B-05, S-10).
 *
 * The time is passed in rather than read, so the boundaries are tested with numbers.
 */
export class FrameRateLimiter {
  private tokens: number;
  private lastRefillMs: number;
  private penaltyUntilMs = Number.NEGATIVE_INFINITY;

  /**
   * @param framesPerSecond the rate, and the size of the bucket
   * @param retryAfterMs how long a refused client has to back off
   */
  constructor(
    private readonly framesPerSecond: number,
    private readonly retryAfterMs: number,
    nowMs: number,
  ) {
    this.tokens = framesPerSecond;
    this.lastRefillMs = nowMs;
  }

  take(nowMs: number): FrameVerdict {
    this.refill(nowMs);

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 'accepted';
    }

    if (nowMs < this.penaltyUntilMs) {
      return 'repeated';
    }

    this.penaltyUntilMs = nowMs + this.retryAfterMs;
    return 'refused';
  }

  private refill(nowMs: number): void {
    const elapsedMs = Math.max(0, nowMs - this.lastRefillMs);

    this.tokens = Math.min(
      this.framesPerSecond,
      this.tokens + (elapsedMs * this.framesPerSecond) / 1_000,
    );
    this.lastRefillMs = nowMs;
  }
}
