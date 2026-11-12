import { describe, expect, it } from 'vitest';

import { readNewRuleSearch } from '@/features/permission/lib/new-rule-search';

describe('readNewRuleSearch — the wizard’s own draft, from an untrusted URL (plan 15, B-27, S-192)', () => {
  it('reads every well-formed field', () => {
    expect(
      readNewRuleSearch({
        kind: 'shell',
        pattern: 'git status:*',
        decision: 'allow',
        scope: 'always',
        folder: '/workspace/app',
      }),
    ).toEqual({
      kind: 'shell',
      pattern: 'git status:*',
      decision: 'allow',
      scope: 'always',
      folder: '/workspace/app',
    });
  });

  it('starts blank when nothing is given', () => {
    expect(readNewRuleSearch({})).toEqual({});
  });

  it('discards a kind the wizard does not know, field by field — never the whole search', () => {
    expect(readNewRuleSearch({ kind: 'made.up', decision: 'allow' })).toEqual({
      decision: 'allow',
    });
  });

  it('discards a decision or a scope outside the grammar', () => {
    expect(readNewRuleSearch({ decision: 'maybe', scope: 'everywhere' })).toEqual({});
  });

  it('discards blank or non-string text fields', () => {
    expect(readNewRuleSearch({ pattern: '   ', folder: 42 })).toEqual({});
  });

  it('never throws on a value of the wrong type', () => {
    expect(() => readNewRuleSearch({ kind: 42, decision: null, scope: [] })).not.toThrow();
    expect(readNewRuleSearch({ kind: 42, decision: null, scope: [] })).toEqual({});
  });
});
