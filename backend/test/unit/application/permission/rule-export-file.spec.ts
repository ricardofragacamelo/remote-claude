import { describe, expect, it } from 'vitest';

import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_RULES,
  RULE_EXPORT_FORMAT,
  RULE_EXPORT_VERSION,
  digestOfImportFile,
  exportItemOf,
  parseImportFile,
  verdictOfImportItem,
} from '@application/permission';
import {
  PermissionRule,
  PermissionRuleImportTooLargeError,
  PermissionRuleImportUnsupportedError,
} from '@domain/permission';
import { UserId } from '@domain/auth';

const owner = UserId.create('auth|owner');
const now = new Date('2026-11-09T12:00:00.000Z');
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const lifetimes = {
  allow: [3_600_000, TEN_YEARS_MS] as const,
  deny: [3_600_000, TEN_YEARS_MS] as const,
};

function fileOf(rules: readonly Record<string, unknown>[] = []): string {
  return JSON.stringify({
    format: RULE_EXPORT_FORMAT,
    version: RULE_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    rules,
  });
}

function activeRule(overrides: Record<string, unknown> = {}): PermissionRule {
  return PermissionRule.create(
    {
      id: 'r1',
      userId: owner,
      sessionId: null,
      projectPath: null,
      pattern: 'shell(git status:*)',
      decision: 'allow',
      scope: 'always',
      createdAt: now,
      expiresAt: new Date(now.getTime() + TEN_YEARS_MS),
      ...overrides,
    },
    TEN_YEARS_MS,
  );
}

describe('digestOfImportFile', () => {
  it('is the same for the same bytes, and different for a single different byte', () => {
    const a = digestOfImportFile(fileOf());
    const b = digestOfImportFile(fileOf());
    const c = digestOfImportFile(fileOf([{ pattern: 'shell(ls)' }]));

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('exportItemOf', () => {
  it('writes the pattern, decision, scope, projectPath and expiresAt — no id, no userId', () => {
    const item = exportItemOf(activeRule());

    expect(item).toEqual({
      pattern: 'shell(git status:*)',
      decision: 'allow',
      scope: 'always',
      projectPath: null,
      expiresAt: new Date(now.getTime() + TEN_YEARS_MS).toISOString(),
    });
    expect(item).not.toHaveProperty('engine');
  });

  it('carries `engine` only for a rule restricted to one', () => {
    expect(exportItemOf(activeRule({ engine: 'claude' }))).toMatchObject({ engine: 'claude' });
  });
});

describe('parseImportFile', () => {
  it('reads the envelope and hands back the raw items, with a digest', () => {
    const parsed = parseImportFile(fileOf([{ pattern: 'shell(ls)' }]));

    expect(parsed.items).toEqual([{ pattern: 'shell(ls)' }]);
    expect(parsed.digest).toBe(digestOfImportFile(fileOf([{ pattern: 'shell(ls)' }])));
  });

  it('refuses malformed JSON — S-140', () => {
    expect(() => parseImportFile('{not json')).toThrow(PermissionRuleImportUnsupportedError);
  });

  it('refuses a format or a version it does not know — S-140', () => {
    expect(() =>
      parseImportFile(JSON.stringify({ format: 'other', version: 1, rules: [] })),
    ).toThrow(PermissionRuleImportUnsupportedError);
    expect(() =>
      parseImportFile(JSON.stringify({ format: RULE_EXPORT_FORMAT, version: 2, rules: [] })),
    ).toThrow(PermissionRuleImportUnsupportedError);
  });

  it('refuses a `rules` that is not an array', () => {
    expect(() =>
      parseImportFile(JSON.stringify({ format: RULE_EXPORT_FORMAT, version: 1, rules: 'nope' })),
    ).toThrow(PermissionRuleImportUnsupportedError);
  });

  it('refuses a file over 256 KB — S-141', () => {
    const big = 'x'.repeat(MAX_IMPORT_BYTES + 1);

    expect(() => parseImportFile(big)).toThrow(PermissionRuleImportTooLargeError);
  });

  it('refuses more than 500 rules — S-141', () => {
    const rules = Array.from({ length: MAX_IMPORT_RULES + 1 }, () => ({ pattern: 'shell(ls)' }));

    expect(() => parseImportFile(fileOf(rules))).toThrow(PermissionRuleImportTooLargeError);
  });
});

describe('verdictOfImportItem', () => {
  it('says `new` for a pattern the caller has nothing like', () => {
    const verdict = verdictOfImportItem(
      { pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always' },
      [],
      owner,
      now,
      lifetimes,
    );

    expect(verdict).toEqual({ kind: 'new', breadth: 'narrow' });
  });

  it('says `existing` for a pattern an active rule of the caller already answers — S-138', () => {
    const verdict = verdictOfImportItem(
      { pattern: 'shell(git status:*)', decision: 'allow', scope: 'always' },
      [activeRule()],
      owner,
      now,
      lifetimes,
    );

    expect(verdict.kind).toBe('existing');
  });

  it('says `invalid` with the pattern code for the old Claude grammar — S-138', () => {
    const verdict = verdictOfImportItem(
      { pattern: 'Bash(git status)', decision: 'allow', scope: 'always' },
      [],
      owner,
      now,
      lifetimes,
    );

    expect(verdict).toMatchObject({ kind: 'invalid', code: 'PERMISSION_RULE_PATTERN_INVALID' });
  });

  it('says `invalid` for an `allow` this build would call unbounded — S-147', () => {
    const verdict = verdictOfImportItem(
      { pattern: 'shell', decision: 'allow', scope: 'always' },
      [],
      owner,
      now,
      lifetimes,
    );

    expect(verdict).toEqual({ kind: 'invalid', code: 'PERMISSION_RULE_TOO_BROAD' });
  });

  it('never refuses a `deny` for its width — a deny is never too broad', () => {
    const verdict = verdictOfImportItem(
      { pattern: 'shell', decision: 'deny', scope: 'always' },
      [],
      owner,
      now,
      lifetimes,
    );

    expect(verdict.kind).toBe('new');
  });

  it('says `invalid` for a decision, scope or projectPath that is not shaped right', () => {
    expect(
      verdictOfImportItem(
        { pattern: 'shell(ls)', decision: 'maybe', scope: 'always' },
        [],
        owner,
        now,
        lifetimes,
      ),
    ).toEqual({ kind: 'invalid', code: 'INVALID_INPUT' });
    expect(
      verdictOfImportItem(
        { pattern: 'shell(ls)', decision: 'allow', scope: 'session' },
        [],
        owner,
        now,
        lifetimes,
      ),
    ).toEqual({ kind: 'invalid', code: 'INVALID_INPUT' });
    expect(
      verdictOfImportItem(
        { pattern: 'shell(ls)', decision: 'allow', scope: 'project' },
        [],
        owner,
        now,
        lifetimes,
      ),
    ).toEqual({ kind: 'invalid', code: 'INVALID_INPUT' });
  });

  it('matches a `project` item by pattern/decision/engine alone — the path is not resolved yet', () => {
    const verdict = verdictOfImportItem(
      {
        pattern: 'shell(git status:*)',
        decision: 'allow',
        scope: 'project',
        projectPath: '/elsewhere',
      },
      [activeRule({ scope: 'project', projectPath: '/srv/projects/app' })],
      owner,
      now,
      lifetimes,
    );

    expect(verdict.kind).toBe('existing');
  });
});
