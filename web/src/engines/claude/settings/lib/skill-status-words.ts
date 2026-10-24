import type { SkillOrigin, SkillUnloadedReason } from '../types/skill';

/** The origin badge — named in full so the i18n check sees every key, the same as `status-words.ts`. */
export const SKILL_ORIGIN_KEYS: Readonly<Record<SkillOrigin, string>> = {
  project: 'engines.claude.skills.originProject',
  user: 'engines.claude.skills.originUser',
  system: 'engines.claude.skills.originSystem',
};

/** Why a candidate a declared hook kept out still shows up, unloaded (B-35, S-167). */
export const SKILL_UNLOADED_REASON_KEYS: Readonly<Record<SkillUnloadedReason, string>> = {
  declaresHook: 'engines.claude.skills.unloadedDeclaresHook',
  linkEscapesHome: 'engines.claude.skills.unloadedLinkEscapesHome',
};
