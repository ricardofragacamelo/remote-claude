import { describe, expect, it } from 'vitest';

import {
  UNMIGRATED,
  UnreadablePermissionRuleRowError,
  toEntity,
  toRow,
} from '@adapter/outbound/persistence/permission/permission-rule.mapper';

const now = new Date('2026-09-24T12:00:00.000Z');

const row = {
  id: 'rule-1',
  userId: 'auth|owner',
  scope: 'project',
  projectPath: '/srv/projects/app',
  pattern: 'shell(git status:*)',
  engine: null,
  grammar: 'canonical',
  disabledReason: null,
  nativePattern: 'Bash(git status:*)',
  decision: 'allow',
  grantedAt: new Date('2026-09-24T10:00:00.000Z'),
  expiresAt: new Date('2026-12-23T10:00:00.000Z'),
  revokedAt: null,
  createdAt: now,
  updatedAt: now,
};

describe('the permission rule mapper', () => {
  it('reads a row back as the rule it was written from', () => {
    const rule = toEntity(row);

    expect(rule.snapshot()).toMatchObject({
      id: 'rule-1',
      scope: 'project',
      projectPath: '/srv/projects/app',
      pattern: 'shell(git status:*)',
      decision: 'allow',
      sessionId: null,
      createdAt: row.grantedAt,
      expiresAt: row.expiresAt,
      revokedAt: null,
    });
    expect(rule.userId.value).toBe('auth|owner');
  });

  it('writes the row the rule reads back from, stamping when', () => {
    expect(toRow(toEntity(row), now)).toEqual({
      id: 'rule-1',
      userId: 'auth|owner',
      scope: 'project',
      projectPath: '/srv/projects/app',
      pattern: 'shell(git status:*)',
      engine: null,
      grammar: 'canonical',
      disabledReason: null,
      nativePattern: null,
      decision: 'allow',
      grantedAt: row.grantedAt,
      expiresAt: row.expiresAt,
      revokedAt: null,
      updatedAt: now,
    });
  });

  it('keeps the engine a rule is restricted to, both ways — S-94', () => {
    const rule = toEntity({ ...row, engine: 'claude' });

    expect(rule.engine).toBe('claude');
    expect(toRow(rule, now).engine).toBe('claude');
  });

  it('reads a rule the migration switched off as disabled, with its old pattern — S-133', () => {
    const rule = toEntity({
      ...row,
      pattern: 'Bash',
      nativePattern: 'Bash',
      disabledReason: 'untranslatable',
    });

    expect(rule.statusAt(now)).toBe('disabled');
    expect(rule.ruleContent).toBe('Bash');
    expect(toRow(rule, now)).toMatchObject({ disabledReason: 'untranslatable', pattern: 'Bash' });
  });

  it('reads a rule still in the engine grammar as not yet migrated: it answers nothing', () => {
    const rule = toEntity({ ...row, pattern: 'Bash(ls)', grammar: 'native', nativePattern: null });

    expect(rule.statusAt(now)).toBe('disabled');
    expect(rule.disabledReason).toBe(UNMIGRATED);
  });

  it('keeps a revocation across the round trip', () => {
    const revoked = toEntity({ ...row, revokedAt: now });

    expect(revoked.statusAt(now)).toBe('revoked');
    expect(toRow(revoked, now).revokedAt).toEqual(now);
  });

  it.each([
    ['scope', { scope: 'session' }],
    ['scope', { scope: 'forever' }],
    ['decision', { decision: 'maybe' }],
  ])('refuses a %s this build does not know, rather than guessing', (column, change) => {
    // Guessing whether an unknown decision meant `allow` is the one guess a permission system
    // may not make.
    expect(() => toEntity({ ...row, ...change })).toThrow(UnreadablePermissionRuleRowError);
    expect(() => toEntity({ ...row, ...change })).toThrow(`permission_rules.${column}`);
  });
});
