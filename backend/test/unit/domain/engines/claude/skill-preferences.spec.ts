import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SKILL_PREFERENCES,
  effectiveSkillPreferences,
  isOriginEnabled,
  isSkillEnabled,
  NO_SKILL_PREFERENCES,
  sameSkillPreferences,
  skillsOptionFor,
  widenedOrigin,
} from '@domain/engines/claude';
import type { SkillPreferences, SkillPreferencesDefaults } from '@domain/engines/claude';

const ON_USER: SkillPreferences = { sources: { user: true }, disabledSkills: [] };
const ON_BOTH: SkillPreferences = { sources: { user: true, system: true }, disabledSkills: [] };

describe('the preferences of a session’s skills — plan 13, B-34; D-20', () => {
  it('is both toggleable origins off, and nothing singled out, by default', () => {
    expect(DEFAULT_SKILL_PREFERENCES).toEqual({ sources: {}, disabledSkills: [] });
  });

  it('has no row anywhere by default', () => {
    expect(NO_SKILL_PREFERENCES).toEqual({ user: null, overrides: [] });
  });

  describe('isOriginEnabled', () => {
    it('is off unless `sources` says `true` explicitly', () => {
      expect(isOriginEnabled(DEFAULT_SKILL_PREFERENCES, 'user')).toBe(false);
      expect(isOriginEnabled({ sources: { user: false }, disabledSkills: [] }, 'user')).toBe(false);
      expect(isOriginEnabled(ON_USER, 'user')).toBe(true);
      expect(isOriginEnabled(ON_USER, 'system')).toBe(false);
    });
  });

  describe('isSkillEnabled', () => {
    it('never gates the project’s own by an origin switch', () => {
      expect(isSkillEnabled(DEFAULT_SKILL_PREFERENCES, 'project', 'review')).toBe(true);
    });

    it('needs its origin on, for a user or a system skill', () => {
      expect(isSkillEnabled(DEFAULT_SKILL_PREFERENCES, 'user', 'remote-claude-user:review')).toBe(
        false,
      );
      expect(isSkillEnabled(ON_USER, 'user', 'remote-claude-user:review')).toBe(true);
    });

    it('is off when the exact qualified name is singled out, origin on or not', () => {
      const preferences: SkillPreferences = {
        sources: { user: true },
        disabledSkills: ['remote-claude-user:review'],
      };
      expect(isSkillEnabled(preferences, 'user', 'remote-claude-user:review')).toBe(false);
      expect(isSkillEnabled(preferences, 'user', 'remote-claude-user:other')).toBe(true);
    });
  });

  describe('skillsOptionFor — S-155', () => {
    const offered = [
      { name: 'review', origin: 'project' as const },
      { name: 'remote-claude-user:draft', origin: 'user' as const },
    ];

    it('is omitted when nothing offered is disabled', () => {
      expect(skillsOptionFor(ON_USER, offered)).toBeUndefined();
    });

    it('is an explicit list once anything is disabled', () => {
      expect(skillsOptionFor(DEFAULT_SKILL_PREFERENCES, offered)).toEqual(['review']);
    });

    it('is empty, never omitted, when disabling leaves nothing (S-156)', () => {
      expect(
        skillsOptionFor({ sources: {}, disabledSkills: ['review'] }, [
          { name: 'review', origin: 'project' },
        ]),
      ).toEqual([]);
    });
  });

  describe('widenedOrigin — S-164', () => {
    it('is the one origin that turned on', () => {
      expect(widenedOrigin(DEFAULT_SKILL_PREFERENCES, ON_USER)).toBe('user');
    });

    it('is null when nothing turned on — narrowing, or no change', () => {
      expect(widenedOrigin(ON_USER, DEFAULT_SKILL_PREFERENCES)).toBeNull();
      expect(widenedOrigin(ON_USER, ON_USER)).toBeNull();
      expect(widenedOrigin(ON_USER, { sources: { user: true }, disabledSkills: ['x'] })).toBeNull();
    });

    it('picks the first origin turned on when both do, in a fixed order', () => {
      expect(widenedOrigin(DEFAULT_SKILL_PREFERENCES, ON_BOTH)).toBe('user');
    });
  });

  describe('sameSkillPreferences — S-163', () => {
    it('is true for the same sources and the same disabled skills, any order', () => {
      expect(
        sameSkillPreferences(
          { sources: { user: true, system: false }, disabledSkills: ['a', 'b'] },
          { sources: { user: true }, disabledSkills: ['b', 'a'] },
        ),
      ).toBe(true);
    });

    it('is false when an origin, or the set of disabled skills, differs', () => {
      expect(sameSkillPreferences(DEFAULT_SKILL_PREFERENCES, ON_USER)).toBe(false);
      expect(
        sameSkillPreferences(
          { sources: {}, disabledSkills: ['a'] },
          { sources: {}, disabledSkills: ['a', 'b'] },
        ),
      ).toBe(false);
    });
  });

  describe('effectiveSkillPreferences — D-04', () => {
    it('is the safety default with no row anywhere', () => {
      expect(effectiveSkillPreferences(NO_SKILL_PREFERENCES, '/srv/repo')).toEqual({
        value: DEFAULT_SKILL_PREFERENCES,
        from: 'installation',
      });
    });

    it('puts the nearest folder over the user over the safety default', () => {
      const stored: SkillPreferencesDefaults = {
        user: ON_USER,
        overrides: [{ folder: '/srv/repo', value: ON_BOTH }],
      };

      expect(effectiveSkillPreferences(stored, '/srv/repo/pkg')).toEqual({
        value: ON_BOTH,
        from: 'folder',
        folder: '/srv/repo',
      });
      expect(effectiveSkillPreferences(stored, '/elsewhere')).toEqual({
        value: ON_USER,
        from: 'user',
      });
      expect(effectiveSkillPreferences(stored, null)).toEqual({ value: ON_USER, from: 'user' });
    });
  });
});
