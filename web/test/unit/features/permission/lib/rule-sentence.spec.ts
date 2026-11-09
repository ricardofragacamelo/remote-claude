import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { createI18n } from '@/shared/i18n';
import { ruleSentence } from '@/features/permission/lib/rule-sentence';
import type { PermissionRule } from '@/features/permission/types/rule';

const en = createI18n('en').t as TFunction;
const pt = createI18n('pt-BR').t as TFunction;

function aRule(overrides: Partial<PermissionRule> = {}): PermissionRule {
  return {
    id: 'rule-1',
    scope: 'always',
    kind: 'shell',
    pattern: 'shell(pnpm test:*)',
    decision: 'allow',
    projectPath: null,
    engine: null,
    grantedBy: 'user-1',
    grantedAt: '2026-09-20T10:00:00.000Z',
    expiresAt: '2026-12-10T10:00:00.000Z',
    status: 'active',
    revokedAt: null,
    disabled: null,
    reach: { kind: 'shell', form: 'prefix', content: 'pnpm test', excludesCompound: true },
    ...overrides,
  } as PermissionRule;
}

describe('the sentence a rule reads as — S-163', () => {
  it('is null for a disabled rule, which has no reach to read from', () => {
    expect(
      ruleSentence(aRule({ reach: null, kind: null, status: 'disabled' }), 'en', en),
    ).toBeNull();
  });

  it('describes a prefix reach that excludes a chained command — allow, always', () => {
    const text = ruleSentence(aRule(), 'en', en);

    expect(text).toContain('Allows');
    expect(text).toContain('pnpm test');
    expect(text).toContain('chained');
    expect(text).toContain('any of your folders');
  });

  it('describes an exact reach — deny, project', () => {
    const text = ruleSentence(
      aRule({
        decision: 'deny',
        scope: 'project',
        projectPath: '/srv/app',
        reach: { kind: 'shell', form: 'exact', content: 'git status', excludesCompound: false },
      }),
      'en',
      en,
    );

    expect(text).toContain('Blocks');
    expect(text).toContain('exactly');
    expect(text).toContain('git status');
    expect(text).toContain('/srv/app');
    expect(text).toContain('subfolders');
  });

  it('describes a prefix reach that does not exclude a chained command', () => {
    const text = ruleSentence(
      aRule({
        reach: { kind: 'shell', form: 'prefix', content: 'pnpm test', excludesCompound: false },
      }),
      'en',
      en,
    );

    expect(text).not.toContain('chained');
    expect(text).toContain('pnpm test');
  });

  it('describes a whole-kind (`any`) reach, by the kind’s own short name', () => {
    const text = ruleSentence(
      aRule({
        kind: 'web.fetch',
        reach: { kind: 'web.fetch', form: 'any', content: null, excludesCompound: false },
      }),
      'en',
      en,
    );

    expect(text).toContain('freely');
  });

  it('reads an empty folder rather than "null" for a `project` rule with no path yet', () => {
    const text = ruleSentence(aRule({ scope: 'project', projectPath: null }), 'en', en);

    expect(text).not.toContain('null');
  });

  it('speaks the visitor’s language', () => {
    const text = ruleSentence(aRule(), 'pt-BR', pt);

    expect(text).toContain('Permite');
    expect(text).toContain('qualquer pasta sua');
  });

  it('shows the validity date, formatted in the visitor’s locale', () => {
    const text = ruleSentence(aRule(), 'en', en);

    expect(text).toContain('Dec 10, 2026');
  });
});
