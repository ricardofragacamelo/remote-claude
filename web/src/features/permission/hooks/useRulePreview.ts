import { useAsyncRead } from '@/shared/hooks/useAsyncRead';
import type { AsyncRead } from '@/shared/hooks/useAsyncRead';
import { previewRule } from '../services/rule.service';
import type { PreviewRuleInput, RulePreview } from '../types/rule';

/**
 * The grammar's own read of a draft pattern — the sentence, the width, the findings against what
 * the caller already has — asked fresh whenever `input` changes (plan 15, B-27, S-185). `null`
 * while there is nothing worth asking yet: a kind not chosen, a subject still empty on a form that
 * needs one. The caller debounces its own `input` before this, if it wants to.
 */
export function useRulePreview(input: PreviewRuleInput | null): AsyncRead<RulePreview> {
  return useAsyncRead(input, previewRule);
}
