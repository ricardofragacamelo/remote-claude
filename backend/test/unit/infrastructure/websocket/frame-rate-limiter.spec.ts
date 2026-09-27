import { describe, expect, it } from 'vitest';

import { FrameRateLimiter } from '@infra/websocket/frame-rate-limiter';

/** Five frames a second, and a second of back-off after a refusal. */
const limiter = (): FrameRateLimiter => new FrameRateLimiter(5, 1_000, 0);

describe('FrameRateLimiter — B-05', () => {
  it('lets a second worth of frames through at once', () => {
    const rate = limiter();

    expect(Array.from({ length: 5 }, () => rate.take(0))).toEqual(Array(5).fill('accepted'));
  });

  it('refuses the frame over the rate — S-10', () => {
    const rate = limiter();
    for (let sent = 0; sent < 5; sent += 1) {
      rate.take(0);
    }

    expect(rate.take(0)).toBe('refused');
  });

  it('calls a frame inside the back-off window a repetition — S-10', () => {
    const rate = limiter();
    for (let sent = 0; sent < 5; sent += 1) {
      rate.take(0);
    }
    rate.take(0);

    expect(rate.take(100)).toBe('repeated');
  });

  it('forgives a client that waited out the back-off', () => {
    const rate = limiter();
    for (let sent = 0; sent < 6; sent += 1) {
      rate.take(0);
    }

    expect(rate.take(1_000)).toBe('accepted');
  });

  it('refills continuously: one frame back every fifth of a second', () => {
    const rate = limiter();
    for (let sent = 0; sent < 5; sent += 1) {
      rate.take(0);
    }

    expect(rate.take(200)).toBe('accepted');
    expect(rate.take(200)).toBe('refused');
  });

  it('never holds more than a second worth, however long the client was quiet', () => {
    const rate = limiter();

    const burst = Array.from({ length: 6 }, () => rate.take(60_000));
    expect(burst.filter((verdict) => verdict === 'accepted')).toHaveLength(5);
  });

  it('does not refill backwards when the clock does', () => {
    const rate = new FrameRateLimiter(1, 1_000, 1_000);
    rate.take(1_000);

    expect(rate.take(500)).toBe('refused');
  });
});
