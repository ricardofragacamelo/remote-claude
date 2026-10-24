import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { saveSkillPreferences } from '../services/skill.service';
import type { SkillPreferencesValue } from '../types/skill';
import { skillKeys } from './skill-keys';

/** The one write this screen makes (plan 13, B-34): the whole preferences value, for one folder. */
export interface SkillMutations {
  save(preferences: SkillPreferencesValue): Promise<SkillPreferencesValue>;
  readonly saving: boolean;
  readonly saveError: AppError | null;
}

/**
 * Settled, never optimistic: the list and the preferences of `folder` are both read again once the
 * backend confirms, the same discipline every other screen of this extension follows.
 */
export function useSkillMutations(folder: string | undefined): SkillMutations {
  const queryClient = useQueryClient();
  const mutation = useMutation<SkillPreferencesValue, AppError, SkillPreferencesValue>({
    mutationFn: (preferences) => saveSkillPreferences(folder as string, preferences),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: skillKeys.preferences(folder ?? '') }),
        queryClient.invalidateQueries({ queryKey: skillKeys.list(folder ?? '') }),
      ]).then(() => undefined),
  });

  return {
    save: (preferences) => mutation.mutateAsync(preferences),
    saving: mutation.isPending,
    saveError: mutation.error,
  };
}
