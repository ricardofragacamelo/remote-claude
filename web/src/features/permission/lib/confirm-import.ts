import type { TFunction } from 'i18next';
import { toast } from 'sonner';

import type { ApplyImportSubmit } from '../hooks/useApplyImport';
import type { RuleImportResult } from '../types/rule';

/**
 * `POST /permission-rules/import`'s own one call, shared by "Modelos" (B-30, a synthesized file)
 * and "Importar" (B-31, a real uploaded one) — both ask the same question (accept these indices,
 * acknowledge these `broad` ones, remap these folders, for this long), only how each arrives at
 * the indices differs (one blanket checkbox against a curated lot, one per item against a real
 * file nobody vetted first).
 */
export function confirmRuleImportApply(args: {
  readonly apply: ApplyImportSubmit['apply'];
  readonly file: string;
  readonly digest: string;
  readonly accept: readonly number[];
  readonly acknowledgeBroad: readonly number[];
  readonly folderMap?: Readonly<Record<string, string>>;
  readonly expiresAt: string;
  onApplied(result: RuleImportResult): void;
}): void {
  void args
    .apply({
      file: args.file,
      digest: args.digest,
      accept: args.accept,
      acknowledgeBroad: args.acknowledgeBroad,
      ...(args.folderMap === undefined ? {} : { folderMap: args.folderMap }),
      expiresAt: args.expiresAt,
    })
    .then((result) => {
      if (result !== null) {
        args.onApplied(result);
      }
    });
}

/** The toast both dialogs raise on a successful apply, differing only in which heading names
 * the batch (a template's own name, or just "the file"). */
export function withAppliedToast(
  t: TFunction,
  messageKey: string,
  onApplied: (result: RuleImportResult) => void,
): (result: RuleImportResult) => void {
  return (result) => {
    toast(t(messageKey, { count: result.counts.created }));
    onApplied(result);
  };
}

/** Both dialogs close themselves the moment their own inner review reports a successful apply. */
export function closeDialogOnApplied(
  onOpenChange: (open: boolean) => void,
  onApplied: (result: RuleImportResult) => void,
): (result: RuleImportResult) => void {
  return (result) => {
    onOpenChange(false);
    onApplied(result);
  };
}
