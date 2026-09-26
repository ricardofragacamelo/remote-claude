import { describe, expect, it } from 'vitest';

import { AUDIT_RETENTION_FLOOR_DAYS, retentionCutoff } from '@domain/audit';

const now = new Date('2026-09-24T12:00:00.000Z');

describe('the retention window', () => {
  it('has a floor of ninety days', () => {
    expect(AUDIT_RETENTION_FLOOR_DAYS).toBe(90);
  });

  it('cuts at exactly the window, in hours rather than calendar days — D-21', () => {
    expect(retentionCutoff(now, 90)).toEqual(new Date(now.getTime() - 2_160 * 60 * 60 * 1000));
  });

  it('moves the cutoff further back as the window grows', () => {
    expect(retentionCutoff(now, 365).getTime()).toBeLessThan(retentionCutoff(now, 90).getTime());
  });
});
