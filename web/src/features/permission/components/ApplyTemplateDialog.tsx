import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LoadStatus } from '@/shared/components/LoadStatus';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { useApplyImport } from '../hooks/useApplyImport';
import { useRuleImportPreview } from '../hooks/useRuleImportPreview';
import { useRuleTemplates } from '../hooks/useRuleTemplates';
import {
  closeDialogOnApplied,
  confirmRuleImportApply,
  withAppliedToast,
} from '../lib/confirm-import';
import {
  hasAcceptedBroadItem,
  isTemplateItemBlocked,
  templateBatchStateOf,
  templateBroadIndices,
  templateExportFileOf,
} from '../lib/template-import';
import type { TemplatePreviewItem } from '../lib/template-import';
import { FolderChoiceButton, NewRuleFolderDialog } from './NewRuleFolderDialog';
import { NewRuleValidityStep } from './NewRuleValidityStep';
import { ReviewBackButton } from './ReviewBackButton';
import { RuleDecisionChip } from './RuleDecisionChip';
import { RuleFailureMessage } from './RuleFailureMessage';
import type { PersistedScope } from '../types/permission';
import type { ReviewStepProps, RuleImportResult, RuleTemplates } from '../types/rule';

export interface ApplyTemplateDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
  onApplied(result: RuleImportResult): void;
}

type Template = RuleTemplates['templates'][number];

/**
 * "Modelos" (plan 15, B-30, D-16): a catalog of ready-made bundles, applied as an import — the
 * same preview and the same second step a real file would go through, never a path of its own.
 * Picking one opens the review of every one of its rules, each toggle-off-able, with the scope,
 * folder and validity chosen once for the whole lot (S-203). Nothing is sent before Confirm.
 *
 * The catalog itself is read only once the dialog is actually open — `ApplyTemplateDialogBody`
 * mounts (and so calls `useRuleTemplates`) only then, so a screen that renders this dialog ahead
 * of ever being opened (the common case: the trigger button is always on screen, the dialog is
 * not) never asks the server for a catalog nobody has looked at yet.
 */
export function ApplyTemplateDialog({
  open,
  onOpenChange,
  onApplied,
}: ApplyTemplateDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        {open && <ApplyTemplateDialogBody onOpenChange={onOpenChange} onApplied={onApplied} />}
      </DialogContent>
    </Dialog>
  );
}

function ApplyTemplateDialogBody({
  onOpenChange,
  onApplied,
}: Omit<ApplyTemplateDialogProps, 'open'>): React.JSX.Element {
  const { t } = useTranslation();
  const { load, isLoading, error, reload } = useRuleTemplates();
  const [selected, setSelected] = useState<Template | null>(null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('rules.templates.heading')}</DialogTitle>
        <DialogDescription>{t('rules.templates.purpose')}</DialogDescription>
      </DialogHeader>

      <LoadStatus
        isLoading={isLoading}
        loadingLabel={t('rules.templates.loading')}
        error={error}
        onRetry={reload}
      />

      {load.status === 'ready' && selected === null && (
        <TemplateCatalog templates={load.value.templates} onPick={setSelected} />
      )}

      {selected !== null && (
        <TemplateReview
          template={selected}
          onBack={() => {
            setSelected(null);
          }}
          onApplied={closeDialogOnApplied(onOpenChange, onApplied)}
        />
      )}
    </>
  );
}

function TemplateCatalog({
  templates,
  onPick,
}: {
  readonly templates: readonly Template[];
  onPick(template: Template): void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ul className="flex flex-col gap-3">
      {templates.map((template) => (
        <li key={template.id} className="flex flex-col gap-2 rounded-md border p-3">
          <h3 className="text-ui-sm font-ui-strong">
            {t(template.name.messageKey, template.name.params)}
          </h3>
          <p className="text-ui-sm text-muted-foreground">
            {t(template.description.messageKey, template.description.params)}
          </p>
          <ul className="flex flex-wrap gap-2">
            {template.rules.map((rule, index) => (
              <li key={index} className="flex items-center gap-1 text-ui-xs">
                <RuleDecisionChip decision={rule.decision} />
                <code>{rule.pattern}</code>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onPick(template);
            }}
          >
            {t('rules.templates.pick')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything `TemplateReview` derives, in one place — the scope/folder/validity chosen once for
 * the whole batch, the preview read fresh whenever they settle enough to build a file, and the
 * `canConfirm`/`accepted`/`validityDecision` `templateBatchStateOf` works out from all of it.
 */
function useTemplateReview(template: Template) {
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const [scope, setScope] = useState<PersistedScope | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [acknowledgeBroad, setAcknowledgeBroad] = useState(false);
  const { submitting, error: submitError, apply } = useApplyImport();

  const scopeReady = scope === 'always' || (scope === 'project' && folder !== null);
  const file =
    scope === null || !scopeReady
      ? null
      : templateExportFileOf({ rules: template.rules, scope, folder });
  const preview = useRuleImportPreview(file);
  const readyPreview = preview.status === 'ready' ? preview.value : null;

  const batch = templateBatchStateOf({
    rules: template.rules,
    excluded,
    preview: readyPreview?.items ?? null,
    acknowledgeBroad,
    scopeReady,
    expiresAt,
    submitting,
  });

  return {
    excluded,
    setExcluded,
    scope,
    setScope,
    folder,
    setFolder,
    expiresAt,
    setExpiresAt,
    acknowledgeBroad,
    setAcknowledgeBroad,
    submitting,
    submitError,
    apply,
    file,
    preview,
    readyPreview,
    batch,
  };
}

function TemplateReview({
  template,
  onBack,
  onApplied,
}: { readonly template: Template } & ReviewStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const review = useTemplateReview(template);

  // `review.batch.canConfirm` — the one thing Confirm is ever enabled by — already requires
  // `scopeReady` (which is exactly when `file` is non-null), `preview.status === 'ready'` and
  // `expiresAt !== null`: by the time this ever runs, all three already hold.
  const onConfirm = (): void => {
    confirmRuleImportApply({
      apply: review.apply,
      file: review.file!,
      digest: review.readyPreview!.digest,
      accept: review.batch.accepted,
      acknowledgeBroad: templateBroadIndices(
        review.readyPreview!.items,
        review.batch.accepted,
        review.acknowledgeBroad,
      ),
      expiresAt: review.expiresAt!,
      onApplied: withAppliedToast(t, 'rules.templates.appliedToast', onApplied),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ReviewBackButton onBack={onBack} labelKey="rules.templates.back" />

      <section>
        <h3 className="text-ui-sm font-ui-strong">{t('rules.templates.rulesHeading')}</h3>
        <ul className="flex flex-col gap-2">
          {template.rules.map((rule, index) => (
            <TemplateRuleCheckbox
              key={index}
              rule={rule}
              verdict={review.readyPreview?.items[index]}
              checked={review.batch.included.has(index)}
              onChange={(checked) => {
                review.setExcluded((current) => {
                  const next = new Set(current);
                  if (checked) {
                    next.delete(index);
                  } else {
                    next.add(index);
                  }
                  return next;
                });
              }}
            />
          ))}
        </ul>
      </section>

      <RuleWizardFolderPicker
        scope={review.scope}
        folder={review.folder}
        onPickScope={review.setScope}
        onOpenPicker={() => {
          setFolderPickerOpen(true);
        }}
      />
      <NewRuleFolderDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        onChoose={(path) => {
          review.setFolder(path);
          setFolderPickerOpen(false);
        }}
      />

      <NewRuleValidityStep
        decision={review.batch.validityDecision}
        expiresAt={review.expiresAt}
        onPick={review.setExpiresAt}
      />

      {review.readyPreview !== null &&
        hasAcceptedBroadItem(review.readyPreview.items, review.batch.accepted) && (
          <label className="flex items-start gap-2 text-ui-sm">
            <input
              type="checkbox"
              checked={review.acknowledgeBroad}
              onChange={(event) => {
                review.setAcknowledgeBroad(event.target.checked);
              }}
            />
            {t('rules.templates.acknowledgeBroad')}
          </label>
        )}

      {review.preview.status === 'failed' && (
        <RuleFailureMessage
          messageKey={review.preview.error.messageKey}
          params={review.preview.error.params}
        />
      )}

      {review.submitError !== null && (
        <RuleFailureMessage
          messageKey={review.submitError.messageKey}
          params={review.submitError.params}
        />
      )}

      <DialogFooter>
        <Button type="button" disabled={!review.batch.canConfirm} onClick={onConfirm}>
          {review.submitting ? t('rules.templates.applying') : t('rules.templates.confirm')}
        </Button>
      </DialogFooter>
    </div>
  );
}

function RuleWizardFolderPicker({
  scope,
  folder,
  onPickScope,
  onOpenPicker,
}: {
  readonly scope: PersistedScope | null;
  readonly folder: string | null;
  onPickScope(scope: PersistedScope): void;
  onOpenPicker(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const scopeLabel = t('rules.wizard.folderStepLabel');

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={scopeLabel}>
        <Button
          type="button"
          variant={scope === 'always' ? 'primary' : 'outline'}
          onClick={() => {
            onPickScope('always');
          }}
        >
          {t('rules.scope.always')}
        </Button>
        <Button
          type="button"
          variant={scope === 'project' ? 'primary' : 'outline'}
          onClick={() => {
            onPickScope('project');
          }}
        >
          {t('rules.scope.project')}
        </Button>
      </div>

      {scope === 'project' && <FolderChoiceButton folder={folder} onOpen={onOpenPicker} />}
    </section>
  );
}

/** The one label this row shows beside itself, blocked taking priority over the server's own
 * `invalid` — both end up disabled, but only one explains why. */
function verdictLabelKeyOf(
  verdict: TemplatePreviewItem | undefined,
  blocked: boolean,
): string | null {
  if (blocked) {
    return 'rules.templates.unboundedBlocked';
  }

  switch (verdict?.verdict) {
    case 'existing':
      return 'rules.templates.verdictExisting';
    case 'invalid':
      return 'rules.templates.verdictInvalid';
    default:
      return null;
  }
}

function TemplateRuleCheckbox({
  rule,
  verdict,
  checked,
  onChange,
}: {
  readonly rule: Template['rules'][number];
  readonly verdict: TemplatePreviewItem | undefined;
  readonly checked: boolean;
  onChange(checked: boolean): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const blocked = verdict !== undefined && isTemplateItemBlocked(verdict);
  const disabled = verdict?.verdict === 'invalid' || blocked;
  const labelKey = verdictLabelKeyOf(verdict, blocked);

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-ui-xs">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked && !disabled}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
        <RuleDecisionChip decision={rule.decision} />
        <code>{rule.pattern}</code>
      </label>

      {labelKey !== null && (
        <span className={disabled ? 'text-destructive' : 'text-muted-foreground'}>
          {t(labelKey)}
        </span>
      )}
    </li>
  );
}
