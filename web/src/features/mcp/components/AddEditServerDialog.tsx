import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { DialogFrame } from '@/shared/components/DialogFrame';
import type { WizardFooterKeys } from '@/shared/components/WizardFooter';
import { WizardFooter } from '@/shared/components/WizardFooter';
import type { AddServerFlow, WizardState } from '../hooks/useAddServerFlow';
import { WIZARD_SCOPE_KEYS } from '../lib/status-words';
import { ServerForm } from './ServerForm';

/** The i18n keys of this wizard's own footer — declared once, outside any JSX. */
const FOOTER_KEYS: WizardFooterKeys = {
  cancel: 'agentSettings.mcp.wizardCancel',
  next: 'agentSettings.mcp.wizardNext',
  previewing: 'agentSettings.mcp.wizardPreviewing',
  back: 'agentSettings.mcp.wizardBack',
  confirm: 'agentSettings.mcp.wizardConfirm',
  saving: 'agentSettings.mcp.wizardSaving',
};

export interface AddEditServerDialogProps {
  readonly flow: AddServerFlow;
  readonly folderChoices: readonly string[];
}

/** What the dialog's own chrome needs from [state] — kept out of the component to stay under the
 * complexity gate (S-132's two steps, each with its own busy flag, already branch enough on their
 * own). */
function wizardViewOf(state: WizardState | null): {
  readonly editing: boolean;
  readonly onPreview: boolean;
  readonly busy: boolean;
} {
  const onPreview = state?.step === 'preview';
  return {
    editing: state?.editing !== null && state?.editing !== undefined,
    onPreview,
    busy: state === null ? false : onPreview ? state.saving : state.previewing,
  };
}

/**
 * The two-step flow of adding or editing an MCP server (plan 13, B-28, S-132): a form, then a
 * preview of the exact description a save would record, the folder it applies to, and — editing a
 * server whose program changes — the permission rules it would revoke (D-62, D-79). Nothing is
 * written until the second step is confirmed.
 */
export function AddEditServerDialog({
  flow,
  folderChoices,
}: AddEditServerDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const state = flow.state;
  const { editing, onPreview, busy } = wizardViewOf(state);

  return (
    <DialogFrame
      open={state !== null}
      onClose={flow.cancel}
      title={t(editing ? 'agentSettings.mcp.editServer' : 'agentSettings.mcp.addServer')}
      description={t(
        onPreview ? 'agentSettings.mcp.wizardPreviewHint' : 'agentSettings.mcp.wizardFormHint',
      )}
      footer={
        <WizardFooter
          step={onPreview ? 'preview' : 'form'}
          keys={FOOTER_KEYS}
          busy={busy}
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
      <WizardBody flow={flow} state={state} folderChoices={folderChoices} />
    </DialogFrame>
  );
}

/** The one step on screen — the form, with its own error, or the preview, with its own. */
function WizardBody({
  flow,
  state,
  folderChoices,
}: {
  readonly flow: AddServerFlow;
  readonly state: WizardState | null;
  readonly folderChoices: readonly string[];
}): React.JSX.Element | null {
  if (state === null) {
    return null;
  }

  // The preview step only renders once the server answered (S-132) — nothing before that.
  if (state.step === 'preview' && state.preview === null) {
    return null;
  }

  if (state.step === 'preview') {
    return (
      <PreviewStep fields={state.fields} preview={state.preview} saveError={state.saveError} />
    );
  }

  return (
    <>
      <ServerForm
        fields={state.fields}
        issues={state.issues}
        existingSecretNames={
          new Set([...(state.editing?.envNames ?? []), ...(state.editing?.headerNames ?? [])])
        }
        folderChoices={folderChoices}
        onChange={flow.setFields}
      />
      {state.previewError !== null && <ErrorState error={state.previewError} />}
    </>
  );
}

function PreviewStep({
  fields,
  preview,
  saveError,
}: {
  readonly fields: {
    readonly scope: 'user' | 'folder';
    readonly folderPath?: string | null | undefined;
  };
  readonly preview: WizardState['preview'];
  readonly saveError: WizardState['saveError'];
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ui">{preview === null ? '' : t(preview.messageKey, preview.params)}</p>
      <p className="text-ui-sm text-muted-foreground">
        {t(WIZARD_SCOPE_KEYS[fields.scope], { folder: fields.folderPath ?? '' })}
      </p>
      {preview !== null && preview.revokedRules.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-ui-sm font-ui-strong text-warning">
            {t('agentSettings.mcp.wizardRevokedRulesTitle', { count: preview.revokedRules.length })}
          </p>
          <ul aria-label={t('agentSettings.mcp.wizardRevokedRulesLabel')} className="text-ui-sm">
            {preview.revokedRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      )}
      {saveError !== null && <ErrorState error={saveError} />}
    </div>
  );
}
