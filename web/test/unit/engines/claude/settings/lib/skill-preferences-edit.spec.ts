import { describe, expect, it } from 'vitest';

import {
  isOriginEnabled,
  skillsAboutToLoad,
  withOriginToggled,
  withSkillsToggled,
} from '@/engines/claude/settings/lib/skill-preferences-edit';
import type { SkillPreferencesValue, SkillView } from '@/engines/claude/settings/types/skill';

const EMPTY: SkillPreferencesValue = { sources: {}, disabledSkills: [] };

describe('isOriginEnabled — D-20', () => {
  it('is off unless sources says true explicitly', () => {
    expect(isOriginEnabled(EMPTY, 'user')).toBe(false);
    expect(isOriginEnabled({ sources: { user: false }, disabledSkills: [] }, 'user')).toBe(false);
    expect(isOriginEnabled({ sources: { user: true }, disabledSkills: [] }, 'user')).toBe(true);
  });
});

describe('withSkillsToggled', () => {
  it('adds a qualified name to disabledSkills, turning one off', () => {
    expect(withSkillsToggled(EMPTY, ['remote-claude-user:review'], false)).toEqual({
      sources: {},
      disabledSkills: ['remote-claude-user:review'],
    });
  });

  it('removes a qualified name from disabledSkills, turning one on', () => {
    const before: SkillPreferencesValue = {
      sources: {},
      disabledSkills: ['remote-claude-user:review', 'remote-claude-user:draft'],
    };

    expect(withSkillsToggled(before, ['remote-claude-user:review'], true)).toEqual({
      sources: {},
      disabledSkills: ['remote-claude-user:draft'],
    });
  });

  it('is idempotent — disabling an already-disabled name changes nothing twice over', () => {
    const before: SkillPreferencesValue = { sources: {}, disabledSkills: ['a'] };

    expect(withSkillsToggled(before, ['a'], false)).toEqual({ sources: {}, disabledSkills: ['a'] });
  });

  it('applies to many names at once, preserving sources untouched', () => {
    const before: SkillPreferencesValue = { sources: { user: true }, disabledSkills: [] };

    expect(withSkillsToggled(before, ['a', 'b'], false)).toEqual({
      sources: { user: true },
      disabledSkills: ['a', 'b'],
    });
  });
});

describe('withOriginToggled', () => {
  it('sets one origin without touching the other, or disabledSkills', () => {
    const before: SkillPreferencesValue = { sources: { system: true }, disabledSkills: ['a'] };

    expect(withOriginToggled(before, 'user', true)).toEqual({
      sources: { system: true, user: true },
      disabledSkills: ['a'],
    });
  });

  it('turns one off', () => {
    const before: SkillPreferencesValue = { sources: { user: true }, disabledSkills: [] };

    expect(withOriginToggled(before, 'user', false)).toEqual({
      sources: { user: false },
      disabledSkills: [],
    });
  });
});

describe('skillsAboutToLoad — S-182', () => {
  const skills: readonly SkillView[] = [
    {
      name: 'review',
      origin: 'user',
      description: '',
      sourceFile: null,
      enabled: false,
      unloadedReason: null,
    },
    {
      name: 'draft',
      origin: 'user',
      description: '',
      sourceFile: null,
      enabled: false,
      unloadedReason: null,
    },
    {
      name: 'deploy',
      origin: 'system',
      description: '',
      sourceFile: null,
      enabled: false,
      unloadedReason: null,
    },
  ];

  it('is every skill of the origin, not already singled out on its own', () => {
    const preferences: SkillPreferencesValue = {
      sources: {},
      disabledSkills: ['remote-claude-user:draft'],
    };

    expect(skillsAboutToLoad(skills, preferences, 'user').map((skill) => skill.name)).toEqual([
      'review',
    ]);
  });

  it('never includes a different origin', () => {
    expect(skillsAboutToLoad(skills, { sources: {}, disabledSkills: [] }, 'system')).toEqual([
      skills[2],
    ]);
  });

  it('is empty when every one of the origin is already singled out', () => {
    const preferences: SkillPreferencesValue = {
      sources: {},
      disabledSkills: ['remote-claude-user:review', 'remote-claude-user:draft'],
    };

    expect(skillsAboutToLoad(skills, preferences, 'user')).toEqual([]);
  });
});
