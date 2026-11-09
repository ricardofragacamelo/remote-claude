import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { createI18n } from '@/shared/i18n';
import { ruleTypeText } from '@/features/permission/lib/rule-reach-text';
import type { PermissionRule } from '@/features/permission/types/rule';

const en = createI18n('en').t as TFunction;

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

describe('the type a rule reads as, on the table — S-162', () => {
  it('names a known kind by its short name', () => {
    const text = ruleTypeText(aRule({ kind: 'shell' }), en);

    expect(text.label).toBe(en('sessions.kind.shell'));
    expect(text.mcp).toBeUndefined();
    expect(text.unknown).toBe(false);
  });

  it('splits an `mcp` reach into its server and its tool', () => {
    const text = ruleTypeText(
      aRule({
        kind: 'mcp',
        pattern: 'mcp(github:create_issue)',
        reach: {
          kind: 'mcp',
          form: 'exact',
          content: 'github:create_issue',
          excludesCompound: false,
        },
      }),
      en,
    );

    expect(text.mcp).toEqual({ server: 'github', tool: 'create_issue' });
    expect(text.unknown).toBe(false);
  });

  it('reads an `mcp` reach with no tool (every tool of the server) as a wildcard', () => {
    const text = ruleTypeText(
      aRule({
        kind: 'mcp',
        reach: { kind: 'mcp', form: 'prefix', content: 'github', excludesCompound: false },
      }),
      en,
    );

    expect(text.mcp).toEqual({ server: 'github', tool: '*' });
  });

  it('names a kind this build does not know generically, and flags it unknown', () => {
    const text = ruleTypeText(aRule({ kind: 'vcs.commit', pattern: 'vcs.commit' }), en);

    expect(text.label).toBe(en('sessions.kind.other'));
    expect(text.unknown).toBe(true);
  });

  it('never calls a disabled rule (`kind: null`) unknown', () => {
    const text = ruleTypeText(aRule({ kind: null, status: 'disabled', reach: null }), en);

    expect(text.label).toBe(en('sessions.kind.other'));
    expect(text.unknown).toBe(false);
    expect(text.mcp).toBeUndefined();
  });
});
