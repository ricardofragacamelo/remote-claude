import { describe, expect, it } from 'vitest';

import { failureMessage, summarisePurge } from '@infra/database/audit-purge';

const cutoff = new Date('2026-06-26T12:00:00.000Z');

describe('summarisePurge', () => {
  it('says what each trail lost, with the dates as ISO strings', () => {
    expect(
      summarisePurge({
        status: 'completed',
        purgeId: 'purge-1',
        triggeredBy: 'cli',
        retentionDays: 90,
        cutoff,
        trails: [
          { trail: 'entries', deleted: 3, failure: null },
          { trail: 'events', deleted: 0, failure: null },
        ],
      }),
    ).toEqual({
      status: 'completed',
      purgeId: 'purge-1',
      triggeredBy: 'cli',
      retentionDays: 90,
      cutoff: '2026-06-26T12:00:00.000Z',
      reason: null,
      trails: [
        { trail: 'entries', deleted: 3, error: null },
        { trail: 'events', deleted: 0, error: null },
      ],
    });
  });

  it('puts the reason of a refusal where the error object was', () => {
    const summary = summarisePurge({
      status: 'failed',
      purgeId: 'purge-2',
      triggeredBy: 'job',
      retentionDays: 90,
      cutoff,
      trails: [{ trail: 'entries', deleted: 1, failure: { error: new Error('refused') } }],
    });

    expect(summary.trails).toEqual([{ trail: 'entries', deleted: 1, error: 'refused' }]);
  });

  it('says why a purge did not run, and that it has no id', () => {
    expect(
      summarisePurge({
        status: 'skipped',
        reason: 'alreadyRunning',
        triggeredBy: 'cli',
        retentionDays: 90,
        cutoff,
      }),
    ).toEqual({
      status: 'skipped',
      purgeId: null,
      reason: 'alreadyRunning',
      triggeredBy: 'cli',
      retentionDays: 90,
      cutoff: '2026-06-26T12:00:00.000Z',
      trails: [],
    });
  });
});

describe('failureMessage', () => {
  it("prefers the driver's message to Drizzle's wrapper", () => {
    const wrapped = new Error('Failed query: DELETE …', {
      cause: new Error('audit_entries is retained for 90 days: DELETE is refused'),
    });

    expect(failureMessage(wrapped)).toBe(
      'audit_entries is retained for 90 days: DELETE is refused',
    );
  });

  it('falls back to the error itself when there is no cause worth reading', () => {
    expect(failureMessage(new Error('connect ECONNREFUSED'))).toBe('connect ECONNREFUSED');
    expect(failureMessage(Object.assign(new Error('outer'), { cause: 'a string' }))).toBe('outer');
  });

  it('says something even about a value that is not an error', () => {
    expect(failureMessage('gone')).toBe('gone');
    expect(failureMessage(null)).toBe('null');
  });
});
