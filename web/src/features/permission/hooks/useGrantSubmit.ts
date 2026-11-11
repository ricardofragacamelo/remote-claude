import { useEffect } from 'react';

import type { AppError } from '@/shared/api/errors';
import { useRuleMutations } from './useRuleMutations';
import type { GrantRuleInput, PermissionRule } from '../types/rule';

export interface GrantSubmit {
  readonly submitting: boolean;
  readonly error: AppError | null;
  confirm(): void;
}

/**
 * The rule-authoring wizard's own one write (plan 15, B-27) — guarded by the draft itself, since
 * there is no rule id yet to guard by (S-194): the same draft pressed twice is the one click this
 * stops; a different one, even from the same screen, is a genuinely different attempt.
 *
 * A folder that left the allowlist since the folder step (S-195) is read from `error` once it has
 * settled into a render, never from the promise's own `.catch`, which still closes over the
 * mutation from before `guarded()` (inside `useRuleMutations`) recorded its failure.
 */
export function useGrantSubmit(
  input: GrantRuleInput,
  onGranted: (rule: PermissionRule) => void,
  onFolderRefused: () => void,
): GrantSubmit {
  const { grant, inFlight, failure } = useRuleMutations();
  const key = JSON.stringify(input);
  const submitting = inFlight.has(key);
  const error = failure?.ruleId === key ? failure.error : null;

  useEffect(() => {
    if (error?.code === 'WORKSPACE_NOT_ALLOWED' || error?.code === 'WORKSPACE_NOT_FOUND') {
      onFolderRefused();
    }
  }, [error, onFolderRefused]);

  return {
    submitting,
    error,
    confirm: () => {
      void grant(input)
        .then(onGranted)
        .catch(() => {});
    },
  };
}
