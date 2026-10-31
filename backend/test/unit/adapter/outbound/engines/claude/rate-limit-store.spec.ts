import { describe, expect, it } from 'vitest';

import {
  InMemoryRateLimitStore,
  sharedRateLimitStore,
} from '@adapter/outbound/engines/claude/rate-limit-store';
import type { RateLimitWindow } from '@domain/engines/claude';

const FIVE_HOUR: RateLimitWindow = {
  kind: 'five_hour',
  status: 'allowed',
  utilizationPercent: 8,
  resetsAt: null,
  observedAt: new Date('2026-10-26T12:00:00.000Z'),
};

const SEVEN_DAY: RateLimitWindow = {
  kind: 'seven_day',
  status: 'allowedWarning',
  utilizationPercent: 72,
  resetsAt: new Date('2026-11-02T00:00:00.000Z'),
  observedAt: new Date('2026-10-26T12:00:00.000Z'),
};

describe('the shared, in-memory latest reading of each rate-limit window — plan 16, D-09', () => {
  it('answers nothing before any window was ever observed', () => {
    expect(new InMemoryRateLimitStore().current()).toEqual([]);
  });

  it('answers every distinct window observed, in no particular order the caller may rely on', () => {
    const store = new InMemoryRateLimitStore();

    store.observe(FIVE_HOUR);
    store.observe(SEVEN_DAY);

    expect(store.current()).toEqual(expect.arrayContaining([FIVE_HOUR, SEVEN_DAY]));
    expect(store.current()).toHaveLength(2);
  });

  it('keeps only the latest reading of a window already observed, by its kind', () => {
    const store = new InMemoryRateLimitStore();
    const staler: RateLimitWindow = { ...FIVE_HOUR, utilizationPercent: 8 };
    const fresher: RateLimitWindow = { ...FIVE_HOUR, utilizationPercent: 40 };

    store.observe(staler);
    store.observe(fresher);

    expect(store.current()).toEqual([fresher]);
  });

  it('exposes one shared instance, so the session module and the settings module never need to import one another', () => {
    expect(sharedRateLimitStore).toBeInstanceOf(InMemoryRateLimitStore);
  });
});
