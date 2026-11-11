import { describe, expect, it } from 'vitest';

import {
  NEW_RULE_KINDS,
  allowsPrefix,
  isNewRuleKind,
  subjectFieldOf,
} from '@/features/permission/lib/rule-kind-fields';
import type { NewRuleKind } from '@/features/permission/lib/rule-kind-fields';

describe('the new-rule wizard’s own kind catalogue — plan 15, B-27', () => {
  it('names every kind exactly once', () => {
    expect(new Set(NEW_RULE_KINDS).size).toBe(NEW_RULE_KINDS.length);
  });

  it('recognises every kind it names, and nothing else', () => {
    for (const kind of NEW_RULE_KINDS) {
      expect(isNewRuleKind(kind)).toBe(true);
    }
    expect(isNewRuleKind('made.up')).toBe(false);
  });

  it('asks for a command, only for shell', () => {
    expect(subjectFieldOf('shell')).toBe('command');
  });

  it('asks for a path, for every file kind', () => {
    for (const kind of [
      'file.read',
      'file.edit',
      'file.write',
      'file.delete',
      'file.move',
    ] as const) {
      expect(subjectFieldOf(kind)).toBe('path');
    }
  });

  it('asks for a domain, only for web.fetch', () => {
    expect(subjectFieldOf('web.fetch')).toBe('domain');
  });

  it('asks for a server and a tool, only for mcp', () => {
    expect(subjectFieldOf('mcp')).toBe('mcp');
  });

  it('asks for nothing — search, web.search and agent only ever offer the whole kind', () => {
    const none: readonly NewRuleKind[] = ['search', 'web.search', 'agent'];
    for (const kind of none) {
      expect(subjectFieldOf(kind)).toBe('none');
    }
  });

  it('offers a prefix only for shell — D-08', () => {
    expect(allowsPrefix('shell')).toBe(true);
    for (const kind of NEW_RULE_KINDS) {
      if (kind !== 'shell') {
        expect(allowsPrefix(kind)).toBe(false);
      }
    }
  });
});
