import { describe, expect, it } from 'vitest';

import {
  EXPIRY_WARNING_MS,
  isExpiringSoon,
  listedRules,
} from '@/features/permission/lib/listed-rule';
import type { PermissionRule } from '@/features/permission';

const now = new Date('2026-09-24T12:00:00.000Z').getTime();

function aRule(overrides: Partial<PermissionRule> = {}): PermissionRule {
  return {
    id: 'r1',
    scope: 'always',
    kind: 'shell',
    pattern: 'shell(git status:*)',
    decision: 'allow',
    projectPath: null,
    grantedBy: 'user-1',
    grantedAt: '2026-09-20T12:00:00.000Z',
    expiresAt: new Date(now + EXPIRY_WARNING_MS * 2).toISOString(),
    status: 'active',
    revokedAt: null,
    disabled: null,
    ...overrides,
  } as PermissionRule;
}

describe('isExpiringSoon', () => {
  it('is false for a rule with more than seven days left', () => {
    expect(
      isExpiringSoon(
        aRule({ expiresAt: new Date(now + EXPIRY_WARNING_MS + 1).toISOString() }),
        now,
      ),
    ).toBe(false);
  });

  it('is true for a rule with fewer than seven days left', () => {
    expect(
      isExpiringSoon(
        aRule({ expiresAt: new Date(now + EXPIRY_WARNING_MS - 1).toISOString() }),
        now,
      ),
    ).toBe(true);
  });

  it('is false for a rule that is not active, however close its date', () => {
    expect(
      isExpiringSoon(aRule({ status: 'expired', expiresAt: new Date(now - 1).toISOString() }), now),
    ).toBe(false);
  });
});

describe('listedRules', () => {
  it('sorts `always` before `project`, and each by its folder', () => {
    const always = aRule({ id: 'a', scope: 'always' });
    const anotherAlways = aRule({ id: 'd', scope: 'always' });
    const projectB = aRule({ id: 'b', scope: 'project', projectPath: '/srv/b' });
    const projectA = aRule({ id: 'c', scope: 'project', projectPath: '/srv/a' });

    const rows = listedRules([projectB, always, projectA, anotherAlways], now);

    expect(rows.map((row) => row.rule.id)).toEqual(['a', 'd', 'c', 'b']);
  });

  it('carries each rule with its own warning', () => {
    const soon = aRule({ id: 'soon', expiresAt: new Date(now + 1).toISOString() });

    expect(listedRules([soon], now)).toEqual([{ rule: soon, expiringSoon: true }]);
  });
});
