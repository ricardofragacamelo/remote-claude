import type {
  ClaudeSkillListPayload,
  ClaudeSkillPreferencesPayload,
  ClaudeSkillPreferencesViewPayload,
} from '@remote-claude/contracts';

import { api } from '@/shared/api';
import type { SkillPreferencesValue, SkillView } from '../types/skill';

const SKILLS = '/engines/claude/skills';

/** `GET /engines/claude/skills?folder=` — every skill that applies in `folder` (plan 13, B-34). */
export async function fetchSkills(folder: string): Promise<readonly SkillView[]> {
  return (await api.get<ClaudeSkillListPayload>(`${SKILLS}?folder=${encodeURIComponent(folder)}`))
    .skills;
}

/**
 * `GET /engines/claude/skills/preferences?folder=` — the raw preferences, not the per-skill
 * `enabled` flags `fetchSkills` derives from them: what a caller reads before sending the whole new
 * value `savePreferences` requires (D-109).
 */
export function fetchSkillPreferences(folder: string): Promise<ClaudeSkillPreferencesViewPayload> {
  return api.get<ClaudeSkillPreferencesViewPayload>(
    `${SKILLS}/preferences?folder=${encodeURIComponent(folder)}`,
  );
}

/** `PUT /engines/claude/skills/preferences` — the whole value, for `folder` (D-108: never a partial toggle). */
export function saveSkillPreferences(
  folder: string,
  preferences: SkillPreferencesValue,
): Promise<ClaudeSkillPreferencesPayload> {
  return api.put<ClaudeSkillPreferencesPayload>(`${SKILLS}/preferences`, {
    folder,
    ...preferences,
  });
}
