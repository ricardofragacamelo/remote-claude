import { describe, expect, it } from 'vitest';

import { rateLimitWindowOf, rateLimitWindowsFromUsageProbe } from '@domain/engines/claude';

const OBSERVED_AT = new Date('2026-10-26T12:00:00.000Z');

describe('a rate-limit reading, read into our own shape — plan 16, D-09', () => {
  it('reads a known status and a fractional utilization as a whole percent', () => {
    const window = rateLimitWindowOf(
      { rateLimitType: 'five_hour', status: 'allowed_warning', utilization: 0.825 },
      OBSERVED_AT,
    );

    expect(window).toEqual({
      kind: 'five_hour',
      status: 'allowedWarning',
      utilizationPercent: 83,
      resetsAt: null,
      observedAt: OBSERVED_AT,
    });
  });

  it('accepts an already-given percentage rather than a 0–1 fraction', () => {
    const window = rateLimitWindowOf(
      { rateLimitType: 'seven_day', status: 'allowed', utilization: 42 },
      OBSERVED_AT,
    );

    expect(window?.utilizationPercent).toBe(42);
  });

  it('reads a seconds epoch and a milliseconds epoch into the same instant', () => {
    const seconds = rateLimitWindowOf(
      { rateLimitType: 'seven_day', status: 'allowed', resetsAt: 1_800_000_000 },
      OBSERVED_AT,
    );
    const millis = rateLimitWindowOf(
      { rateLimitType: 'seven_day', status: 'allowed', resetsAt: 1_800_000_000_000 },
      OBSERVED_AT,
    );

    expect(seconds?.resetsAt).toEqual(new Date(1_800_000_000_000));
    expect(millis?.resetsAt).toEqual(new Date(1_800_000_000_000));
  });

  it('forwards a window kind this build has never seen, rather than dropping it', () => {
    const window = rateLimitWindowOf(
      { rateLimitType: 'seven_day_fable', status: 'rejected' },
      OBSERVED_AT,
    );

    expect(window?.kind).toBe('seven_day_fable');
    expect(window?.status).toBe('rejected');
  });

  it('answers null when the reading carries no window name or no status this build knows', () => {
    expect(rateLimitWindowOf({ status: 'allowed' }, OBSERVED_AT)).toBeNull();
    expect(rateLimitWindowOf({ rateLimitType: 'five_hour' }, OBSERVED_AT)).toBeNull();
    expect(
      rateLimitWindowOf({ rateLimitType: 'five_hour', status: 'made_up' }, OBSERVED_AT),
    ).toBeNull();
  });

  it('answers null utilization and null resetsAt when the CLI did not report them', () => {
    const window = rateLimitWindowOf({ rateLimitType: 'overage', status: 'allowed' }, OBSERVED_AT);

    expect(window).toEqual({
      kind: 'overage',
      status: 'allowed',
      utilizationPercent: null,
      resetsAt: null,
      observedAt: OBSERVED_AT,
    });
  });
});

describe('the windows of a usage-probe answer, read without a session open — plan 16, D-09', () => {
  it('reads every fixed window the probe carries, guessing a status from the percent', () => {
    const windows = rateLimitWindowsFromUsageProbe(
      {
        five_hour: { utilization: 8, resets_at: '2026-10-26T16:00:00.000Z' },
        seven_day: { utilization: 83, resets_at: '2026-10-29T00:00:00.000Z' },
        seven_day_opus: { utilization: 100, resets_at: null },
      },
      OBSERVED_AT,
    );

    expect(windows).toEqual([
      {
        kind: 'five_hour',
        status: 'allowed',
        utilizationPercent: 8,
        resetsAt: new Date('2026-10-26T16:00:00.000Z'),
        observedAt: OBSERVED_AT,
      },
      {
        kind: 'seven_day',
        status: 'allowedWarning',
        utilizationPercent: 83,
        resetsAt: new Date('2026-10-29T00:00:00.000Z'),
        observedAt: OBSERVED_AT,
      },
      {
        kind: 'seven_day_opus',
        status: 'rejected',
        utilizationPercent: 100,
        resetsAt: null,
        observedAt: OBSERVED_AT,
      },
    ]);
  });

  it('reads a per-model window by its own label, stable across probes regardless of array order', () => {
    const windows = rateLimitWindowsFromUsageProbe(
      { model_scoped: [{ display_name: 'Fable', utilization: 12, resets_at: null }] },
      OBSERVED_AT,
    );

    expect(windows).toEqual([
      {
        kind: 'model_scoped:fable',
        status: 'allowed',
        utilizationPercent: 12,
        resetsAt: null,
        observedAt: OBSERVED_AT,
        displayName: 'Fable',
      },
    ]);
  });

  it('reads overage only when it is actually enabled for this account', () => {
    const disabled = rateLimitWindowsFromUsageProbe(
      { extra_usage: { is_enabled: false, utilization: 0 } },
      OBSERVED_AT,
    );
    const enabled = rateLimitWindowsFromUsageProbe(
      { extra_usage: { is_enabled: true, utilization: 5, resets_at: null } },
      OBSERVED_AT,
    );

    expect(disabled).toEqual([]);
    expect(enabled).toEqual([
      {
        kind: 'overage',
        status: 'allowed',
        utilizationPercent: 5,
        resetsAt: null,
        observedAt: OBSERVED_AT,
      },
    ]);
  });

  it('answers no window at all when the account has none, or the shape is not one it knows', () => {
    expect(rateLimitWindowsFromUsageProbe(null, OBSERVED_AT)).toEqual([]);
    expect(rateLimitWindowsFromUsageProbe(undefined, OBSERVED_AT)).toEqual([]);
    expect(rateLimitWindowsFromUsageProbe('not an object', OBSERVED_AT)).toEqual([]);
    expect(rateLimitWindowsFromUsageProbe({ five_hour: 'not a window' }, OBSERVED_AT)).toEqual([]);
    expect(
      rateLimitWindowsFromUsageProbe({ model_scoped: [{ utilization: 1 }] }, OBSERVED_AT),
    ).toEqual([]);
  });
});
