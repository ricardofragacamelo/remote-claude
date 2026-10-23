import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { DialogFrame } from '@/shared/components/DialogFrame';
import { Button } from '@/shared/components/ui/button';
import type { AddServerFlow, WizardState } from '../hooks/useAddServerFlow';
import { WIZARD_SCOPE_KEYS } from '../lib/status-words';
import { ServerForm } from './ServerForm';

export interface AddEditServerDialogProps {
  readonly flow: AddServerFlow;
  readonly folderChoices: readonly string[];
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
  const editing = state?.editing !== null && state?.editing !== undefined;

  return (
    <DialogFrame
      open={state !== null}
      onClose={flow.cancel}
      title={t(editing ? 'agentSettings.mcp.editServer' : 'agentSettings.mcp.addServer')}
      description={t(
        state?.step === 'preview'
          ? 'agentSettings.mcp.wizardPreviewHint'
          : 'agentSettings.mcp.wizardFormHint',
      )}
      footer={<WizardFooter flow={flow} state={state} />}
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

  if (state.step === 'preview') {
    return state.preview === null ? null : (
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

/** The footer's two buttons — one pair for the form, another for the preview (S-132). */
function WizardFooter({
  flow,
  state,
}: {
  readonly flow: AddServerFlow;
  readonly state: WizardState | null;
}): React.JSX.Element {
  const { t } = useTranslation();

  if (state?.step === 'preview') {
    return (
      <>
        <Button variant="outline" disabled={state.saving} onClick={flow.back}>
          {t('agentSettings.mcp.wizardBack')}
        </Button>
        <Button
          disabled={state.saving}
          onClick={() => {
            void flow.confirm();
          }}
        >
          {state.saving
            ? t('agentSettings.mcp.wizardSaving')
            : t('agentSettings.mcp.wizardConfirm')}
        </Button>
      </>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={flow.cancel}>
        {t('agentSettings.mcp.wizardCancel')}
      </Button>
      <Button
        disabled={state?.previewing}
        onClick={() => {
          void flow.toPreview();
        }}
      >
        {state?.previewing
          ? t('agentSettings.mcp.wizardPreviewing')
          : t('agentSettings.mcp.wizardNext')}
      </Button>
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
