import type { UserId } from '@domain/auth';
import type { SkillPreferences, SkillPreferencesDefaults } from '@domain/engines/claude';

/** Where the skill preferences each user keeps for Claude's sessions live — theirs, and each folder's. */
export interface SkillPreferencesRepository {
  read(userId: UserId): Promise<SkillPreferencesDefaults>;

  /** Sets the preferences of the user (`folder` `null`) or of a folder — the last save wins, whole. */
  save(userId: UserId, folder: string | null, preferences: SkillPreferences): Promise<void>;
}

export const SKILL_PREFERENCES_REPOSITORY = Symbol('SkillPreferencesRepository');
