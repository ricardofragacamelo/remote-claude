import { describe, expect, it } from 'vitest';

import { patternOf } from '@/features/permission/lib/new-rule-pattern';
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
