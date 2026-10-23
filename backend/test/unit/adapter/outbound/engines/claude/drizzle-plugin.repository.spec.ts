import { describe, expect, it } from 'vitest';

import { resolvedConflict } from '@adapter/outbound/engines/claude/drizzle-plugin.repository';
import { UserId } from '@domain/auth';
import type { StoredPlugin } from '@application/engines/claude';

const ROW: StoredPlugin = {
  id: 'plugin-1',
  userId: UserId.create('auth|owner'),
  origin: 'marketplace',
  path: '/srv/plugins/u1/acme/my-plugin',
  marketplace: 'acme',
  commit: 'c0ffee',
  name: 'my-plugin',
  approvedDigest: 'digest-1',
  enabled: true,
  createdAt: new Date('2026-10-23T00:00:00Z'),
  updatedAt: new Date('2026-10-23T00:00:00Z'),
};

describe('resolvedConflict — plan 13, B-47, S-208', () => {
  it('answers the reread row when it exists', () => {
    expect(resolvedConflict(ROW, ROW.path)).toBe(ROW);
  });

  it('throws when the conflicting row could not be reread — the defensive guard', () => {
    expect(() => resolvedConflict(null, '/srv/plugins/u1/acme/my-plugin')).toThrow(
      'plugin at /srv/plugins/u1/acme/my-plugin conflicted but could not be re-read',
    );
  });
});
