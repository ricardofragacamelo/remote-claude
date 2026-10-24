import { useQuery } from '@tanstack/react-query';
import type { ClaudeSkillPreferencesViewPayload } from '@remote-claude/contracts';

import type { AppError } from '@/shared/api/errors';
import { readStateOf, type ReadState } from '@/features/agent-settings';
import { fetchSkillPreferences } from '../services/skill.service';
import { EMPTY_SKILL_PREFERENCES } from '../types/skill';
import type { SkillPreferencesValue } from '../types/skill';
import { skillKeys } from './skill-keys';

/** The preferences that apply in the folder asked — never blended away the way `enabled` flags are. */
export interface SkillPreferencesState extends ReadState {
  readonly value: SkillPreferencesValue;
}

/**
 * `GET /engines/claude/skills/preferences?folder=` — what a toggle needs to read before sending the
 * whole new value back (D-108, D-109): `value` is the *effective* one, inherited bits included, so
 * flipping one field never silently drops what a user's or an ancestor's own preference already set.
 */
export function useSkillPreferences(folder: string | undefined): SkillPreferencesState {
  const query = useQuery<ClaudeSkillPreferencesViewPayload, AppError>({
    queryKey: skillKeys.preferences(folder ?? ''),
    queryFn: () => fetchSkillPreferences(folder as string),
    enabled: folder !== undefined,
    retry: false,
  });

  return { value: query.data?.effective.value ?? EMPTY_SKILL_PREFERENCES, ...readStateOf(query) };
}
