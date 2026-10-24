import { describe, expect, it } from 'vitest';

import { isValidSkillName, skillFrontmatterDeclaresHook } from '@domain/engines/claude';

describe('skillFrontmatterDeclaresHook — plan 13, B-35, S-167', () => {
  it('is false for a frontmatter with no hooks field at all', () => {
    expect(skillFrontmatterDeclaresHook({})).toBe(false);
  });

  it('is true the moment a hooks field is declared, whatever shape it takes', () => {
    expect(skillFrontmatterDeclaresHook({ hooks: {} })).toBe(true);
    expect(skillFrontmatterDeclaresHook({ hooks: [] })).toBe(true);
    expect(skillFrontmatterDeclaresHook({ hooks: null })).toBe(true);
  });
});

describe('isValidSkillName — plan 13, B-34, S-160', () => {
  it.each(['explain', 'security-review', 'a', 'a-b-c', 'skill123'])(
    'accepts %s — lower-case letters, digits and hyphens',
    (name) => {
      expect(isValidSkillName(name)).toBe(true);
    },
  );

  it.each([
    '',
    'Explain',
    'has space',
    '-leading',
    'trailing-',
    'double--hyphen',
    'has_underscore',
    'a'.repeat(65),
  ])('rejects %s', (name) => {
    expect(isValidSkillName(name)).toBe(false);
  });

  it('accepts exactly 64 characters, the documented ceiling', () => {
    expect(isValidSkillName('a'.repeat(64))).toBe(true);
  });
});
