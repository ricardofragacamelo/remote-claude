import { describe, expect, it } from 'vitest';

import type { SlashCommand } from '@domain/session';
import {
  isValidSkillName,
  skillFrontmatterDeclaresHook,
  skillLabelOf,
  skillOriginOf,
} from '@domain/engines/claude';

function skill(name: string, builtin = false): SlashCommand {
  return { name, description: '', argumentHint: '', aliases: [], builtin };
}

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

describe('skillOriginOf — plan 13, B-34, S-157', () => {
  it('is the project’s own for a bare name', () => {
    expect(skillOriginOf(skill('review'))).toBe('project');
  });

  it('is the user’s own, qualified by its plugin', () => {
    expect(skillOriginOf(skill('remote-claude-user:review'))).toBe('user');
  });

  it('is the system’s own, qualified by its plugin', () => {
    expect(skillOriginOf(skill('remote-claude-system:review'))).toBe('system');
  });

  it('is the project’s own for a namespace this menu does not recognise — a project plugin’s own', () => {
    expect(skillOriginOf(skill('some-other-plugin:review'))).toBe('project');
  });

  it('falls back to `system` for the one case `reloadSkills()` never actually produces (B-01)', () => {
    expect(skillOriginOf(skill('review', true))).toBe('system');
  });
});

describe('skillLabelOf — plan 13, B-34', () => {
  it('is the whole name when it carries no namespace', () => {
    expect(skillLabelOf('review')).toBe('review');
  });

  it('drops the plugin namespace up to its last colon', () => {
    expect(skillLabelOf('remote-claude-user:review')).toBe('review');
  });
});
