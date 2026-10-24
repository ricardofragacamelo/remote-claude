import { useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import {
  skillsAboutToLoad,
  withOriginToggled,
  withSkillsToggled,
} from '../lib/skill-preferences-edit';
import type { SkillMutations } from './useSkillMutations';
import type { SkillPreferencesValue, SkillView, ToggleableSkillOrigin } from '../types/skill';

/**
 * Every toggle this screen offers (plan 13, B-34, D-20): a skill, one by one or in a batch, applies
 * at once; a toggleable origin turning off applies at once too — only turning one *on* widens what a
 * session may load, so it asks first, showing what is about to start loading (S-182).
 */
export interface SkillToggleFlow {
  /** The origin a "turn on" confirm is open for — `null` while none is asked. */
  readonly pendingOrigin: ToggleableSkillOrigin | null;
  readonly aboutToLoad: readonly SkillView[];
  readonly busy: boolean;
  readonly error: AppError | null;
  toggleOrigin(origin: ToggleableSkillOrigin, enabled: boolean): void;
  confirmEnableOrigin(): void;
  cancelEnableOrigin(): void;
  toggleSkills(qualifiedNames: readonly string[], enabled: boolean): void;
}

export function useSkillToggleFlow(
  preferences: SkillPreferencesValue,
  skills: readonly SkillView[],
  mutations: SkillMutations,
): SkillToggleFlow {
  const [pendingOrigin, setPendingOrigin] = useState<ToggleableSkillOrigin | null>(null);

  return {
    pendingOrigin,
    aboutToLoad:
      pendingOrigin === null ? [] : skillsAboutToLoad(skills, preferences, pendingOrigin),
    busy: mutations.saving,
    error: mutations.saveError,
    toggleOrigin: (origin, enabled) => {
      if (enabled) {
        setPendingOrigin(origin);
      } else {
        void mutations.save(withOriginToggled(preferences, origin, false));
      }
    },
    confirmEnableOrigin: () => {
      if (pendingOrigin !== null) {
        void mutations.save(withOriginToggled(preferences, pendingOrigin, true));
      }
      setPendingOrigin(null);
    },
    cancelEnableOrigin: () => {
      setPendingOrigin(null);
    },
    toggleSkills: (qualifiedNames, enabled) => {
      void mutations.save(withSkillsToggled(preferences, qualifiedNames, enabled));
    },
  };
}
