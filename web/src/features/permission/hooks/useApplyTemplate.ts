import { useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { applyRuleImport } from '../services/rule.service';
import type { ApplyRuleImportInput, RuleImportResult } from '../types/rule';

export interface ApplyTemplateSubmit {
  readonly submitting: boolean;
  readonly error: AppError | null;

  /** `null` on failure — `error` already holds why, nothing thrown for the caller to catch twice. */
  apply(input: ApplyRuleImportInput): Promise<RuleImportResult | null>;
}

/** "Modelos"'s own one write (plan 15, B-30) — the same guard shape `useGrantSubmit` gives the
 * single-rule wizard, kept apart from it: a batch has no one rule id to key a guard by, and
 * `useRuleMutations`'s own registry is for a rule already on screen, never a catalog bundle. */
export function useApplyTemplate(): ApplyTemplateSubmit {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  return {
    submitting,
    error,
    apply: async (input) => {
      setSubmitting(true);
      setError(null);

      try {
        return await applyRuleImport(input);
      } catch (caught) {
        setError(caught as AppError);
        return null;
      } finally {
        setSubmitting(false);
      }
    },
  };
}
