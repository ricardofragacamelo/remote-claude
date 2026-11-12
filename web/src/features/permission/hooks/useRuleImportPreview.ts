import { useAsyncRead } from '@/shared/hooks/useAsyncRead';
import type { AsyncRead } from '@/shared/hooks/useAsyncRead';
import { previewRuleImport } from '../services/rule.service';
import type { RuleImportPreview } from '../types/rule';

/**
 * One verdict per item of an import file, read fresh whenever the file itself changes (plan 15,
 * B-30) — `null` while there is nothing to preview yet (no template chosen, no folder picked for
 * a `project`-scoped batch).
 */
export function useRuleImportPreview(file: string | null): AsyncRead<RuleImportPreview> {
  return useAsyncRead(file, previewRuleImport);
}
