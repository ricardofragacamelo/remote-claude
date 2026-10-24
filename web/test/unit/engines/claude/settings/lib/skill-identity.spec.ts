import { describe, expect, it } from 'vitest';

import {
  isToggleableOrigin,
  qualifiedSkillNameOf,
  skillRowKeyOf,
  SYSTEM_SKILLS_PLUGIN,
  USER_SKILLS_PLUGIN,
} from '@/engines/claude/settings/lib/skill-identity';

describe('qualifiedSkillNameOf — plan 13, B-34', () => {
  it('is the bare name for the project’s own', () => {
    expect(qualifiedSkillNameOf({ origin: 'project', name: 'review' })).toBe('review');
  });

  it('is qualified by the user’s own plugin', () => {
    expect(qualifiedSkillNameOf({ origin: 'user', name: 'review' })).toBe(
      `${USER_SKILLS_PLUGIN}:review`,
    );
  });

  it('is qualified by the system’s own plugin', () => {
    expect(qualifiedSkillNameOf({ origin: 'system', name: 'review' })).toBe(
      `${SYSTEM_SKILLS_PLUGIN}:review`,
    );
  });
});

describe('skillRowKeyOf — S-157', () => {
  it('never collides between a project skill and a user one of the same name', () => {
    const project = skillRowKeyOf({ origin: 'project', name: 'review' });
    const user = skillRowKeyOf({ origin: 'user', name: 'review' });

    expect(project).not.toBe(user);
  });
});

describe('isToggleableOrigin — D-20', () => {
  it('is true for user and system, false for the project’s own', () => {
    expect(isToggleableOrigin('user')).toBe(true);
    expect(isToggleableOrigin('system')).toBe(true);
    expect(isToggleableOrigin('project')).toBe(false);
  });
});
