import type {
  ClaudeSkillListPayloadSkillsItem,
  ClaudeSkillPreferencesPayload,
  ClaudeSkillPreferencesViewPayload,
} from '@remote-claude/contracts';

/** One skill of the project, the user or the system, as the Skills section lists it (plan 13, B-34). */
export type SkillView = ClaudeSkillListPayloadSkillsItem;

/** `project`, `user` or `system` — the badge the Skills section shows. */
export type SkillOrigin = SkillView['origin'];

/** Why a skill that would otherwise show up never reached the installation at all (B-35, S-167). */
export type SkillUnloadedReason = NonNullable<SkillView['unloadedReason']>;

/** The whole preferences value a `PUT` writes, or a `GET .../preferences` echoes back. */
export type SkillPreferencesValue = ClaudeSkillPreferencesPayload;

/** `GET /engines/claude/skills/preferences?folder=` — what applies, the user's own, and the folder's. */
export type SkillPreferencesView = ClaudeSkillPreferencesViewPayload;

/** The two origins a whole switch can turn on or off — the project's own is always on (D-20). */
export type ToggleableSkillOrigin = Extract<SkillOrigin, 'user' | 'system'>;

/** Nothing singled out, both toggleable origins off — the safety default (D-20) a fresh read starts from. */
export const EMPTY_SKILL_PREFERENCES: SkillPreferencesValue = { sources: {}, disabledSkills: [] };
