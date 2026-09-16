import { describe, expect, it } from 'vitest';

import { SystemClock } from '@shared/time/system-clock';

describe('SystemClock', () => {
  it('answers the current instant', () => {
    const before = Date.now();

    const now = new SystemClock().now();

    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
