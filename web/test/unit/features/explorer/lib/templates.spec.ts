import { describe, expect, it } from 'vitest';

import {
  baseNameOf,
  dayOf,
  FILE_TEMPLATES,
  resolveTemplate,
  templateOf,
} from '@/features/explorer/lib/templates';

describe('the templates of "New from template" — S-169, 07 · D-19', () => {
  it('has the built-in set, each with a translated name and a suggested extension', () => {
    expect(FILE_TEMPLATES.map((template) => template.id)).toEqual([
      'markdown',
      'json',
      'typescript',
      'test',
      'gitignore',
      'editorconfig',
      'claude',
    ]);
    expect(
      FILE_TEMPLATES.every((template) => template.labelKey.startsWith('explorer.template.')),
    ).toBe(true);
  });

  it('finds a template by id, and nothing for one this version lacks', () => {
    expect(templateOf('json')?.suggestedName).toBe('data.json');
    expect(templateOf('cobol')).toBeUndefined();
  });

  it('resolves the name and the day, everywhere they are', () => {
    const markdown = templateOf('markdown');
    const test = templateOf('test');

    expect(markdown && resolveTemplate(markdown, 'plan.md', new Date(2026, 0, 5))).toBe(
      '# plan\n\n_2026-01-05_\n',
    );
    expect(test && resolveTemplate(test, 'sum.spec.ts', new Date(2026, 0, 5))).toContain(
      "describe('sum.spec'",
    );
  });

  it('takes the extension off a name — the last one, a leading dot not counting', () => {
    expect(baseNameOf('a.tar.gz')).toBe('a.tar');
    expect(baseNameOf('.gitignore')).toBe('.gitignore');
    expect(baseNameOf('README')).toBe('README');
    expect(dayOf(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
