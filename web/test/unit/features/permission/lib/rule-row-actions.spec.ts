import { describe, expect, it, vi } from 'vitest';

import { ruleRowActions, ruleRowElementId } from '@/features/permission/lib/rule-row-actions';
import type { PermissionRule } from '@/features/permission/types/rule';

function aRule(overrides: Partial<PermissionRule> = {}): PermissionRule {
  return {
    id: 'rule-1',
    scope: 'always',
    kind: 'shell',
    pattern: 'shell(git status:*)',
    decision: 'allow',
    projectPath: null,
    engine: null,
    grantedBy: 'user-1',
    grantedAt: '2026-09-20T10:00:00.000Z',
    expiresAt: '2026-12-19T10:00:00.000Z',
    status: 'active',
    revokedAt: null,
    disabled: null,
    ...overrides,
  } as PermissionRule;
}

describe('a rule row’s own actions — S-161', () => {
  it('always offers to open it', () => {
    const onOpen = vi.fn();
    const actions = ruleRowActions(aRule({ id: 'r1' }), { onOpen, onRevoke: vi.fn() });
    const open = actions.find((action) => action.id === 'rules.open');

    expect(open?.available()).toBe(true);
    open?.run();
    expect(onOpen).toHaveBeenCalledWith('r1');
  });

  it('offers to revoke an active or expired rule', () => {
    const onRevoke = vi.fn();
    const actions = ruleRowActions(aRule({ id: 'r1', status: 'active' }), {
      onOpen: vi.fn(),
      onRevoke,
    });
    const revoke = actions.find((action) => action.id === 'rules.revoke');

    expect(revoke?.available()).toBe(true);
    revoke?.run();
    expect(onRevoke).toHaveBeenCalledWith('r1');
  });

  it('never offers to revoke a rule already revoked', () => {
    const actions = ruleRowActions(aRule({ status: 'revoked' }), {
      onOpen: vi.fn(),
      onRevoke: vi.fn(),
    });

    expect(actions.find((action) => action.id === 'rules.revoke')?.available()).toBe(false);
  });

  it('never offers to revoke a disabled rule — it has nothing left to take back', () => {
    const actions = ruleRowActions(aRule({ status: 'disabled', kind: null }), {
      onOpen: vi.fn(),
      onRevoke: vi.fn(),
    });

    expect(actions.find((action) => action.id === 'rules.revoke')?.available()).toBe(false);
  });
});

describe('the DOM id of a rule’s row', () => {
  it('is stable for the same id, and distinct across rules', () => {
    expect(ruleRowElementId('r1')).toBe(ruleRowElementId('r1'));
    expect(ruleRowElementId('r1')).not.toBe(ruleRowElementId('r2'));
  });
});
