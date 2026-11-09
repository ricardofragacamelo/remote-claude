import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { createI18n } from '@/shared/i18n';
import { ruleOrigin } from '@/features/permission/lib/rule-origin';
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
    expiresAt: '2026-12-10T10:00:00.000Z',
    status: 'active',
    revokedAt: null,
    disabled: null,
    grantedVia: null,
    ...overrides,
  } as PermissionRule;
}

describe('how a rule came to exist', () => {
  it('says so for each `grantedVia`', () => {
    expect(ruleOrigin(aRule({ grantedVia: 'approval' }), 'en', en)).toContain('request');
    expect(ruleOrigin(aRule({ grantedVia: 'request' }), 'en', en)).toContain('this screen');
    expect(ruleOrigin(aRule({ grantedVia: 'import' }), 'en', en)).toContain('Imported');
    expect(ruleOrigin(aRule({ grantedVia: 'restore' }), 'en', en)).toContain('Restored');
  });

  it('says the origin was not recorded for a rule granted before this column existed', () => {
    expect(ruleOrigin(aRule({ grantedVia: null }), 'en', en)).toContain('not recorded');
  });

  it('shows who granted it and when', () => {
    const text = ruleOrigin(aRule({ grantedVia: 'request', grantedBy: 'auth|42' }), 'en', en);

    expect(text).toContain('auth|42');
    expect(text).toContain('Sep 20, 2026');
  });
});
