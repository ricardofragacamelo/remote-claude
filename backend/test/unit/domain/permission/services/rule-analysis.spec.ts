import { describe, expect, it } from 'vitest';

import { analyzeRules, parseRulePattern, ruleBreadth } from '@domain/permission';
import type { AnalyzableRule } from '@domain/permission';

const of = (
  id: string,
  pattern: string,
  overrides: Partial<Omit<AnalyzableRule, 'id' | 'pattern' | 'ruleContent' | 'breadth'>> = {},
): AnalyzableRule => {
  const parsed = parseRulePattern(pattern);

  return {
    id,
    pattern: parsed,
    ruleContent: pattern,
    engine: null,
    decision: 'allow',
    scope: 'always',
    projectPath: null,
    breadth: ruleBreadth(parsed),
    folderReachable: null,
    ...overrides,
  };
};

const disabled = (id: string): AnalyzableRule => ({
  id,
  pattern: null,
  ruleContent: 'Bash(git status:*)',
  engine: null,
  decision: 'allow',
  scope: 'always',
  projectPath: null,
  breadth: null,
  folderReachable: null,
});

/** The redundancy/overlap/conflict analysis over the caller's active rules — plan 15, B-15. */
describe('analyzeRules', () => {
  it('finds a draft identical to an active rule, pointing at it both ways — S-110', () => {
    const a = of('a', 'shell(git status)');
    const draft = of('draft', 'shell(git status)');

    const findings = analyzeRules([a, draft]);

    expect(findings.get('a')).toEqual([
      {
        kind: 'identical',
        ruleIds: ['draft'],
        messageKey: 'permission.ruleFinding.identical',
        params: {},
      },
    ]);
    expect(findings.get('draft')).toEqual([
      {
        kind: 'identical',
        ruleIds: ['a'],
        messageKey: 'permission.ruleFinding.identical',
        params: {},
      },
    ]);
  });

  it('flags the narrower of two allows of the same decision as redundant — S-111', () => {
    const wide = of('wide', 'shell(git status:*)');
    const narrow = of('narrow', 'shell(git status)');

    const findings = analyzeRules([wide, narrow]);

    expect(findings.get('narrow')).toEqual([
      {
        kind: 'redundant',
        ruleIds: ['wide'],
        messageKey: 'permission.ruleFinding.redundant',
        params: {},
      },
    ]);
    expect(findings.get('wide')).toEqual([]);
  });

  it('shadows an allow entirely covered by a deny — never responds — S-112', () => {
    const deny = of('deny', 'shell', { decision: 'deny' });
    const allow = of('allow', 'shell(git status)');

    const findings = analyzeRules([deny, allow]);

    expect(findings.get('allow')).toEqual([
      {
        kind: 'shadowedByDeny',
        ruleIds: ['deny'],
        messageKey: 'permission.ruleFinding.shadowedByDeny',
        params: {},
      },
    ]);
    expect(findings.get('deny')).toEqual([]);
  });

  it('flags a partial overlap between an allow and a deny that does not fully shadow it — S-112', () => {
    // The deny is scoped to one project and reaches the whole shell kind there; the allow is
    // `always` but only an exact command — the deny does not cover it everywhere `always` reaches,
    // and the allow does not cover the deny's whole-kind pattern either: a real, partial overlap.
    const deny = of('deny', 'shell', { decision: 'deny', scope: 'project', projectPath: '/a' });
    const allow = of('allow', 'shell(git status)', { scope: 'always' });

    const findings = analyzeRules([deny, allow]);

    expect(findings.get('allow')).toEqual([
      {
        kind: 'overlapsDeny',
        ruleIds: ['deny'],
        messageKey: 'permission.ruleFinding.overlapsDeny',
        params: {},
      },
    ]);
  });

  it('flags a project rule covered by an always of the same decision as redundant — S-113', () => {
    const always = of('always', 'shell(git status)', { scope: 'always' });
    const project = of('project', 'shell(git status)', { scope: 'project', projectPath: '/a' });

    const findings = analyzeRules([always, project]);

    expect(findings.get('project')).toEqual([
      {
        kind: 'redundant',
        ruleIds: ['always'],
        messageKey: 'permission.ruleFinding.redundant',
        params: {},
      },
    ]);
  });

  it('never relates two project rules of unrelated folders — S-114', () => {
    const a = of('a', 'shell(git status)', { scope: 'project', projectPath: '/a' });
    const b = of('b', 'shell(git status)', { scope: 'project', projectPath: '/b' });

    const findings = analyzeRules([a, b]);

    expect(findings.get('a')).toEqual([]);
    expect(findings.get('b')).toEqual([]);
  });

  it('relates a project rule to one of a subfolder it now reaches — D-10, revised 2026-11-05', () => {
    const parent = of('parent', 'shell(git status)', { scope: 'project', projectPath: '/a' });
    const child = of('child', 'shell(git status)', {
      scope: 'project',
      projectPath: '/a/backend',
    });

    const findings = analyzeRules([parent, child]);

    expect(findings.get('child')).toEqual([
      {
        kind: 'redundant',
        ruleIds: ['parent'],
        messageKey: 'permission.ruleFinding.redundant',
        params: {},
      },
    ]);
  });

  it('never analyses a disabled rule, or finds anything against one — S-115 (adjacent)', () => {
    const findings = analyzeRules([disabled('d'), of('a', 'shell(git status)')]);

    expect(findings.get('d')).toEqual([]);
    expect(findings.get('a')).toEqual([]);
  });

  it('flags an old broad or unbounded rule as too broad, standing on its own — S-116', () => {
    // Different kinds, so the pair is never pattern-related — the only finding either gets is
    // its own breadth, not a `redundant` from the other.
    const unbounded = of('u', 'shell');
    const broad = of('b', 'web.fetch');

    const findings = analyzeRules([unbounded, broad]);

    expect(findings.get('u')).toEqual([
      {
        kind: 'tooBroad',
        ruleIds: [],
        messageKey: 'permission.ruleFinding.tooBroad',
        params: { breadth: 'unbounded' },
      },
    ]);
    expect(findings.get('b')).toEqual([
      {
        kind: 'tooBroad',
        ruleIds: [],
        messageKey: 'permission.ruleFinding.tooBroad',
        params: { breadth: 'broad' },
      },
    ]);
  });

  it('flags an unreachable project folder on its own, regardless of other rules', () => {
    const rule = of('r', 'shell(git status)', {
      scope: 'project',
      projectPath: '/gone',
      folderReachable: false,
    });

    expect(analyzeRules([rule]).get('r')).toEqual([
      {
        kind: 'unreachable',
        ruleIds: [],
        messageKey: 'permission.ruleFinding.unreachable',
        params: {},
      },
    ]);
  });

  it('gives the same findings in the same order every time — S-120', () => {
    const rules = [
      of('u', 'shell'),
      of('wide', 'shell(git status:*)'),
      of('narrow', 'shell(git status)'),
      of('deny', 'shell(rm:*)', { decision: 'deny' }),
    ];

    const first = analyzeRules(rules);
    const second = analyzeRules([...rules]);

    expect([...first]).toEqual([...second]);
  });
});
