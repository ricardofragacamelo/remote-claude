import { describe, expect, it } from 'vitest';

import {
  draftFromPattern,
  kindOfPattern,
  patternOf,
} from '@/features/permission/lib/new-rule-pattern';
import type { NewRulePatternDraft } from '@/features/permission/lib/new-rule-pattern';

function draft(
  partial: Partial<NewRulePatternDraft> & { kind: NewRulePatternDraft['kind'] },
): NewRulePatternDraft {
  return { form: 'exact', subject: '', ...partial };
}

describe('patternOf — the wizard’s own canonical pattern builder (plan 15, B-27)', () => {
  it('writes the whole kind, when the form is "any"', () => {
    expect(patternOf(draft({ kind: 'shell', form: 'any', subject: 'git status' }))).toBe('shell');
  });

  it('writes the whole kind, when the subject is empty, whatever the form', () => {
    expect(patternOf(draft({ kind: 'file.edit', form: 'exact', subject: '   ' }))).toBe(
      'file.edit',
    );
  });

  it('writes an exact match, trimmed', () => {
    expect(patternOf(draft({ kind: 'shell', form: 'exact', subject: '  git status  ' }))).toBe(
      'shell(git status)',
    );
  });

  it('writes a prefix, only ever for shell', () => {
    expect(patternOf(draft({ kind: 'shell', form: 'prefix', subject: 'git status' }))).toBe(
      'shell(git status:*)',
    );
  });

  it('writes a path kind’s own exact match the same way', () => {
    expect(patternOf(draft({ kind: 'file.edit', form: 'exact', subject: 'src/a.ts' }))).toBe(
      'file.edit(src/a.ts)',
    );
  });

  it('writes a domain match for web.fetch', () => {
    expect(patternOf(draft({ kind: 'web.fetch', form: 'exact', subject: 'example.com' }))).toBe(
      'web.fetch(example.com)',
    );
  });

  it('writes mcp’s own server:tool, never the bare kind', () => {
    expect(patternOf(draft({ kind: 'mcp', subject: 'github', mcpTool: 'create_issue' }))).toBe(
      'mcp(github:create_issue)',
    );
  });

  it('writes mcp’s own whole-server form when the tool is left out', () => {
    expect(patternOf(draft({ kind: 'mcp', subject: 'github', mcpTool: '' }))).toBe('mcp(github:*)');
    expect(patternOf(draft({ kind: 'mcp', subject: 'github' }))).toBe('mcp(github:*)');
  });

  it('trims mcp’s own server and tool', () => {
    expect(
      patternOf(draft({ kind: 'mcp', subject: '  github  ', mcpTool: '  create_issue  ' })),
    ).toBe('mcp(github:create_issue)');
  });
});

describe('kindOfPattern — which kind a stored pattern starts with (plan 15, B-30)', () => {
  it('reads the kind off a bare-kind pattern', () => {
    expect(kindOfPattern('search')).toBe('search');
    expect(kindOfPattern('agent')).toBe('agent');
  });

  it('reads the kind off a subject-shaped pattern', () => {
    expect(kindOfPattern('shell(git status:*)')).toBe('shell');
    expect(kindOfPattern('file.read(src/a.ts)')).toBe('file.read');
    expect(kindOfPattern('mcp(github:create_issue)')).toBe('mcp');
  });

  it('is null for a pattern naming none of this wizard’s own kinds', () => {
    expect(kindOfPattern('Bash(git status)')).toBeNull();
    expect(kindOfPattern('')).toBeNull();
  });
});

describe('draftFromPattern — the inverse of patternOf (plan 15, B-30, D-01, S-204)', () => {
  it('reads a bare-kind pattern as "any", with an empty subject', () => {
    expect(draftFromPattern('search', 'search')).toEqual({ form: 'any', subject: '' });
  });

  it('reads an exact pattern', () => {
    expect(draftFromPattern('file.read(src/a.ts)', 'file.read')).toEqual({
      form: 'exact',
      subject: 'src/a.ts',
    });
  });

  it('reads a shell prefix, never any other kind’s own', () => {
    expect(draftFromPattern('shell(git status:*)', 'shell')).toEqual({
      form: 'prefix',
      subject: 'git status',
    });
  });

  it('reads a non-shell kind’s own trailing ":*" as part of an exact subject, not a prefix', () => {
    expect(draftFromPattern('file.read(foo:*)', 'file.read')).toEqual({
      form: 'exact',
      subject: 'foo:*',
    });
  });

  it('reads mcp’s own server and tool apart', () => {
    expect(draftFromPattern('mcp(github:create_issue)', 'mcp')).toEqual({
      form: 'exact',
      subject: 'github',
      mcpTool: 'create_issue',
    });
  });

  it('reads mcp’s own whole-server form as an empty tool', () => {
    expect(draftFromPattern('mcp(github:*)', 'mcp')).toEqual({
      form: 'exact',
      subject: 'github',
      mcpTool: '',
    });
  });

  it('is null for mcp with no server:tool separator at all', () => {
    expect(draftFromPattern('mcp(github)', 'mcp')).toBeNull();
  });

  it('is null for a pattern that does not start with the kind it was given', () => {
    expect(draftFromPattern('file.edit(src/a.ts)', 'file.read')).toBeNull();
  });

  it('is null for a pattern missing the closing parenthesis', () => {
    expect(draftFromPattern('shell(git status', 'shell')).toBeNull();
  });

  it('round-trips every shape patternOf itself ever writes', () => {
    const cases: readonly NewRulePatternDraft[] = [
      { kind: 'search', form: 'any', subject: '' },
      { kind: 'shell', form: 'exact', subject: 'git status' },
      { kind: 'shell', form: 'prefix', subject: 'git status' },
      { kind: 'file.read', form: 'exact', subject: 'src/a.ts' },
      { kind: 'web.fetch', form: 'exact', subject: 'example.com' },
      { kind: 'mcp', form: 'exact', subject: 'github', mcpTool: 'create_issue' },
      { kind: 'mcp', form: 'exact', subject: 'github', mcpTool: '' },
    ];

    for (const original of cases) {
      const pattern = patternOf(original);
      const parsed = draftFromPattern(pattern, original.kind);
      expect(parsed).not.toBeNull();
      expect(patternOf({ kind: original.kind, ...parsed! })).toBe(pattern);
    }
  });
});
