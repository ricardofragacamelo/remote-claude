import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { readStateOf, type ReadState } from '@/features/agent-settings';
import { fetchSkills } from '../services/skill.service';
import type { SkillView } from '../types/skill';
import { skillKeys } from './skill-keys';

/** The skills of the folder asked (plan 13, B-34) — nothing is read before one is chosen. */
export interface Skills extends ReadState {
  readonly skills: readonly SkillView[];
}

/** `GET /engines/claude/skills?folder=` — refetched whenever a preference of this screen settles. */
export function useSkills(folder: string | undefined): Skills {
  const query = useQuery<readonly SkillView[], AppError>({
    queryKey: skillKeys.list(folder ?? ''),
    queryFn: () => fetchSkills(folder as string),
    enabled: folder !== undefined,
    retry: false,
  });

  return { skills: query.data ?? [], ...readStateOf(query) };
}
