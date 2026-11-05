import { describe, expect, it } from 'vitest';

import { toPayload } from '@adapter/outbound/persistence/notice/persisted-notice.mapper';

describe('toPayload — Plan 27, F7, D-15', () => {
  it('fills `at` from `recordedAt` when the payload carries none — every live notice', () => {
    const payload = toPayload({
      payload: { noticeId: 'n1', kind: 'agent.info', level: 'warning' },
      recordedAt: new Date('2026-11-03T10:00:00.000Z'),
    });

    expect(payload.at).toBe('2026-11-03T10:00:00.000Z');
  });

  it('leaves `at` alone when the payload already carries one — a future write that sets its own', () => {
    const payload = toPayload({
      payload: {
        noticeId: 'n1',
        kind: 'agent.info',
        level: 'warning',
        at: '2026-11-03T09:00:00.000Z',
      },
      recordedAt: new Date('2026-11-03T10:00:00.000Z'),
    });

    expect(payload.at).toBe('2026-11-03T09:00:00.000Z');
  });
});
