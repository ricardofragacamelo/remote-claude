import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRoots } from '@/features/workspace';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useApplyImport } from '../hooks/useApplyImport';
import type { ApplyImportSubmit } from '../hooks/useApplyImport';
import { useRuleImportPreview } from '../hooks/useRuleImportPreview';
import {
  closeDialogOnApplied,
  confirmRuleImportApply,
  withAppliedToast,
} from '../lib/confirm-import';
import { importBatchStateOf, importedPathsOf, importRowsOf } from '../lib/file-import';
import type { ImportRow } from '../lib/file-import';
import { RuleFailureMessage } from './RuleFailureMessage';
import { RuleDecisionChip } from './RuleDecisionChip';
import { ReviewBackButton } from './ReviewBackButton';
import { NewRuleValidityStep } from './NewRuleValidityStep';
import { NewRuleFolderDialog } from './NewRuleFolderDialog';
import type { ReviewStepProps, RuleImportResult } from '../types/rule';

export interface ImportRulesDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
  onApplied(result: RuleImportResult): void;
}

/**
 * "Importar" (plan 15, B-31, D-17): a real file, chosen from the visitor's own machine — never
 * the workspace's own folder browser, which walks the *backend's* filesystem, not this one. The
 * same preview→apply pair "Modelos" already uses (B-30), read per item instead of as one
 * curated lot: each `broad` item is confirmed on its own (S-206), and a `project` item whose own
 * folder this installation does not have is remapped — once, by path, through the same folder
 * seletor every other step of this feature already shares.
 */
export function ImportRulesDialog({
  open,
  onOpenChange,
  onApplied,
}: ImportRulesDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {open && <ImportRulesDialogBody onOpenChange={onOpenChange} onApplied={onApplied} />}
      </DialogContent>
    </Dialog>
  );
}

function ImportRulesDialogBody({
  onOpenChange,
  onApplied,
}: Omit<ImportRulesDialogProps, 'open'>): React.JSX.Element {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('rules.import.heading')}</DialogTitle>
        <DialogDescription>{t('rules.import.purpose')}</DialogDescription>
      </DialogHeader>

      {file === null ? (
        <FileChooser onChosen={setFile} />
      ) : (
        <ImportReview
          file={file}
          onBack={() => {
            setFile(null);
          }}
          onApplied={closeDialogOnApplied(onOpenChange, onApplied)}
        />
      )}
    </>
  );
}

function FileChooser({ onChosen }: { onChosen(file: string): void }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <label className="flex min-h-touch items-center justify-center rounded-md border border-dashed p-6 text-ui-sm">
      {t('rules.import.chooseFile')}
      <input
        type="file"
        accept="application/json"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen !== undefined) {
            void chosen.text().then(onChosen);
          }
        }}
      />
    </label>
  );
}

/** Everything `ImportReview` derives, same split `useTemplateReview` already uses for "Modelos"
 * (B-30) — the preview, the allowlist, every per-row and per-batch state, in one place. */
function useFileImportReview(file: string) {
  const preview = useRuleImportPreview(file);
  const { roots } = useRoots();
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const [acknowledgedBroad, setAcknowledgedBroad] = useState<ReadonlySet<number>>(new Set());
  const [remapped, setRemapped] = useState<ReadonlyMap<string, string>>(new Map());
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const { submitting, error: submitError, apply } = useApplyImport();

  const paths = importedPathsOf(file);
  const rows =
    preview.status === 'ready'
      ? importRowsOf(preview.value.items, paths, roots, new Set(remapped.keys()))
      : [];
  const included = new Set(
    rows.map((row) => row.item.index).filter((index) => !excluded.has(index)),
  );
  const batch = importBatchStateOf({
    rows,
    included,
    acknowledgedBroad,
    expiresAt,
    submitting,
  });

  return {
    preview,
    rows,
    excluded,
    setExcluded,
    acknowledgedBroad,
    setAcknowledgedBroad,
    remapped,
    setRemapped,
    expiresAt,
    setExpiresAt,
    submitting,
    submitError,
    apply,
    batch,
  };
}

function ImportReview({
  file,
  onBack,
  onApplied,
}: { readonly file: string } & ReviewStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [remapPickerFor, setRemapPickerFor] = useState<string | null>(null);
  const review = useFileImportReview(file);

  // `review.batch.canConfirm` already requires `preview.status === 'ready'` and
  // `expiresAt !== null` — by the time this ever runs, both already hold.
  const readyPreview = review.preview.status === 'ready' ? review.preview.value : null;

  const onConfirm = (): void => {
    confirmRuleImportApply({
      apply: review.apply,
      file,
      digest: readyPreview!.digest,
      accept: review.batch.accepted,
      acknowledgeBroad: review.batch.acknowledgeBroad,
      folderMap: Object.fromEntries(review.remapped),
      expiresAt: review.expiresAt!,
      onApplied: withAppliedToast(t, 'rules.import.appliedToast', onApplied),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ReviewBackButton onBack={onBack} labelKey="rules.import.chooseDifferent" />

      {review.preview.status === 'loading' && <p role="status">{t('rules.import.reading')}</p>}

      {review.preview.status === 'failed' && (
        <RuleFailureMessage
          messageKey={review.preview.error.messageKey}
          params={review.preview.error.params}
        />
      )}

      {readyPreview !== null && (
        <>
          <table className="w-full text-ui-xs">
            <thead>
              <tr className="text-left">
                <th className="p-1">{t('rules.import.colInclude')}</th>
                <th className="p-1">{t('rules.import.colRule')}</th>
                <th className="p-1">{t('rules.import.colVerdict')}</th>
              </tr>
            </thead>
            <tbody>
              {review.rows.map((row) => (
                <ImportRuleRow
                  key={row.item.index}
                  row={row}
                  checked={!review.excluded.has(row.item.index)}
                  acknowledged={review.acknowledgedBroad.has(row.item.index)}
                  onToggle={(checked) => {
                    review.setExcluded((current) => {
                      const next = new Set(current);
                      if (checked) {
                        next.delete(row.item.index);
                      } else {
                        next.add(row.item.index);
                      }
                      return next;
                    });
                  }}
                  onAcknowledge={(checked) => {
                    review.setAcknowledgedBroad((current) => {
                      const next = new Set(current);
                      if (checked) {
                        next.add(row.item.index);
                      } else {
                        next.delete(row.item.index);
                      }
                      return next;
                    });
                  }}
                  onRemap={() => {
                    // Rendered only for a `needsRemap` row, which is only ever true alongside a
                    // non-null `projectPath` (`importRowsOf`'s own invariant).
                    setRemapPickerFor(row.projectPath!);
                  }}
                />
              ))}
            </tbody>
          </table>

          <NewRuleFolderDialog
            open={remapPickerFor !== null}
            onOpenChange={() => {
              // Radix only ever calls this to report a close (Escape, backdrop, Cancel) — this
              // dialog's own open state is otherwise driven by `remapPickerFor` alone, never by
              // Radix reporting one it opened itself.
              setRemapPickerFor(null);
            }}
            onChoose={(path) => {
              // Only rendered, and so only clickable, while `remapPickerFor` is itself set.
              review.setRemapped((current) => new Map(current).set(remapPickerFor!, path));
              setRemapPickerFor(null);
            }}
          />

          <NewRuleValidityStep
            decision={review.batch.validityDecision}
            expiresAt={review.expiresAt}
            onPick={review.setExpiresAt}
          />
        </>
      )}

      {review.submitError !== null && (
        <RuleFailureMessage
          messageKey={review.submitError.messageKey}
          params={review.submitError.params}
        />
      )}
      <ImportRejectionDetails error={review.submitError} />

      <DialogFooter>
        <Button type="button" disabled={!review.batch.canConfirm} onClick={onConfirm}>
          {review.submitting ? t('rules.import.applying') : t('rules.import.confirm')}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ImportRuleRow({
  row,
  checked,
  acknowledged,
  onToggle,
  onAcknowledge,
  onRemap,
}: {
  readonly row: ImportRow;
  readonly checked: boolean;
  readonly acknowledged: boolean;
  onToggle(checked: boolean): void;
  onAcknowledge(checked: boolean): void;
  onRemap(): void;
}): React.JSX.Element {
  const disabled = row.item.verdict === 'invalid' || row.blocked || row.needsRemap;

  return (
    <tr className="border-t">
      <td className="p-1">
        <input
          type="checkbox"
          checked={checked && !disabled}
          disabled={disabled}
          onChange={(event) => {
            onToggle(event.target.checked);
          }}
        />
      </td>
      <td className="p-1">
        <RuleDecisionChip decision={row.item.decision === 'allow' ? 'allow' : 'deny'} />{' '}
        <code>{row.item.pattern}</code>
      </td>
      <td className="p-1">
        <ImportRuleVerdictCell
          row={row}
          acknowledged={acknowledged}
          onAcknowledge={onAcknowledge}
          onRemap={onRemap}
        />
      </td>
    </tr>
  );
}

/** What the verdict column shows — a reason the row is forced off (invalid, blocked, needs a
 * folder), or the one acknowledgement a `broad` row still needs, never more than one at once. */
function ImportRuleVerdictCell({
  row,
  acknowledged,
  onAcknowledge,
  onRemap,
}: {
  readonly row: ImportRow;
  readonly acknowledged: boolean;
  onAcknowledge(checked: boolean): void;
  onRemap(): void;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (row.needsRemap) {
    return (
      <Button type="button" variant="outline" size="touch" onClick={onRemap}>
        {t('rules.import.remap', { folder: row.projectPath })}
      </Button>
    );
  }

  if (row.blocked) {
    return <>{t('rules.import.unboundedBlocked')}</>;
  }

  if (row.item.verdict === 'invalid') {
    return <>{t('rules.import.verdictInvalid')}</>;
  }

  if (row.item.breadth === 'broad') {
    return (
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => {
            onAcknowledge(event.target.checked);
          }}
        />
        {t('rules.import.acknowledgeBroad')}
      </label>
    );
  }

  return row.item.verdict === 'existing' ? <>{t('rules.import.verdictExisting')}</> : null;
}

function ImportRejectionDetails({
  error,
}: {
  readonly error: ApplyImportSubmit['error'];
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (error === null || error.details.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-1 text-ui-xs text-destructive">
      {error.details.map((detail) => (
        <li key={detail.field}>
          {t('rules.import.rejectedItem', { field: detail.field, rule: detail.rule })}
        </li>
      ))}
    </ul>
  );
}
