import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DialogFrame } from '@/shared/components/DialogFrame';
import { ErrorState } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';
import type { WizardFooterKeys } from '@/shared/components/WizardFooter';
import { WizardFooter } from '@/shared/components/WizardFooter';
import type { AddLocalPluginFlow, AddLocalPluginState } from '../hooks/useAddLocalPluginFlow';
import { PluginFolderBrowseDialog } from './PluginFolderBrowseDialog';

/** The i18n keys of this wizard's own footer — declared once, outside any JSX. */
const FOOTER_KEYS: WizardFooterKeys = {
  cancel: 'engines.claude.plugins.wizardCancel',
  next: 'engines.claude.plugins.wizardNext',
  previewing: 'engines.claude.plugins.wizardPreviewing',
  back: 'engines.claude.plugins.wizardBack',
  confirm: 'engines.claude.plugins.wizardConfirm',
  saving: 'engines.claude.plugins.wizardSaving',
};

export interface AddLocalPluginDialogProps {
  readonly flow: AddLocalPluginFlow;
}

/**
 * The two-step flow of adding a local plugin (plan 13, B-29, S-125, S-137): choosing a folder
 * through {@link PluginFolderBrowseDialog} — never a path typed loose —, then a preview of exactly
 * what the manifest at that path declares, word for word (`POST .../plugins/preview`). Nothing is
 * written until the second step is confirmed, the same discipline `mcp`'s own `AddEditServerDialog`
 * already has — and the same shared `WizardFooter` it uses.
 */
export function AddLocalPluginDialog({ flow }: AddLocalPluginDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const state = flow.state;
  const onPreview = state?.step === 'preview';
  const [browseOpen, setBrowseOpen] = useState(false);

  return (
    <>
      <DialogFrame
        open={state !== null}
        onClose={flow.cancel}
        title={t('engines.claude.plugins.addLocal')}
        description={t(
          onPreview
            ? 'engines.claude.plugins.wizardPreviewHint'
            : 'engines.claude.plugins.wizardFormHint',
        )}
        footer={
          <WizardFooter
            step={onPreview ? 'preview' : 'form'}
            keys={FOOTER_KEYS}
            busy={onPreview ? (state?.saving ?? false) : (state?.previewing ?? false)}
            onCancel={flow.cancel}
            onBack={flow.back}
            onNext={() => {
              void flow.toPreview();
            }}
            onConfirm={() => {
              void flow.confirm();
            }}
          />
        }
      >
        <WizardBody state={state} onBrowse={() => setBrowseOpen(true)} />
      </DialogFrame>

      <PluginFolderBrowseDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        onChoose={(path) => {
          flow.setPath(path);
          setBrowseOpen(false);
        }}
      />
    </>
  );
}

/** The one step on screen — the path field, or the preview, each with its own error. */
function WizardBody({
  state,
  onBrowse,
}: {
  readonly state: AddLocalPluginState | null;
  onBrowse(): void;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (state === null) {
    return null;
  }

  if (state.step === 'form') {
    return (
      <PathField
        path={state.path}
        pathIssue={state.pathIssue}
        previewError={state.previewError}
        onBrowse={onBrowse}
      />
    );
  }

  // `useAddLocalPluginFlow.toPreview()` only ever moves to `step: 'preview'` together with
  // `preview` set in the same update — there is no state with one and not the other to defend
  // against here.
  const preview = state.preview!;

  // Nothing is written reaching here — the second step's own confirm does that.
  return (
    <fieldset className="flex flex-col gap-3">
      <p className="text-ui">{t(preview.messageKey, preview.params)}</p>
      {state.saveError !== null && <ErrorState error={state.saveError} />}
    </fieldset>
  );
}

function PathField({
  path,
  pathIssue,
  previewError,
  onBrowse,
}: {
  readonly path: string;
  readonly pathIssue: AddLocalPluginState['pathIssue'];
  readonly previewError: AddLocalPluginState['previewError'];
  onBrowse(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const browseButton = (
    <Button variant="outline" onClick={onBrowse}>
      {t('engines.claude.plugins.browse')}
    </Button>
  );

  return (
    <section className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-ui-sm" htmlFor="plugin-path">
        {t('engines.claude.plugins.fieldPath')}
        <span className="flex gap-2">
          <input
            id="plugin-path"
            className="h-10 flex-1 rounded-lg border border-border bg-transparent px-3 text-ui"
            value={path}
            readOnly
          />
          {browseButton}
        </span>
      </label>
      {pathIssue !== null && <p className="text-ui-sm text-destructive">{t(pathIssue)}</p>}
      {previewError !== null && <ErrorState error={previewError} />}
    </section>
  );
}
