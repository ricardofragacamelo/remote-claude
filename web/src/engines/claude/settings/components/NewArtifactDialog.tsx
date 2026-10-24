import { useTranslation } from 'react-i18next';

import { ConfirmFooterButtons } from '@/shared/components/ConfirmFooterButtons';
import { DialogFrame } from '@/shared/components/DialogFrame';
import type { CreateArtifactFlow } from '../hooks/useCreateArtifactFlow';

export interface NewArtifactDialogProps {
  readonly flow: CreateArtifactFlow;
  /** Already translated — the dialog's title, description and the field's own label. */
  readonly title: string;
  readonly description: string;
  readonly nameLabel: string;
}

/**
 * The one form every "new <kind>" flow of this screen shares (plan 13, D-18): a name, validated
 * before the server ever sees it, and once more by the server's own `FILE_EXISTS` (S-153). Confirm is
 * disabled while the name fails either check, so a person is never let submit a value already known
 * to fail.
 */
export function NewArtifactDialog({
  flow,
  title,
  description,
  nameLabel,
}: NewArtifactDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const invalid = flow.nameInvalid || flow.nameTaken || flow.name.length === 0;

  return (
    <DialogFrame
      open={flow.open}
      onClose={flow.cancel}
      title={title}
      description={description}
      footer={
        <ConfirmFooterButtons
          keys={{
            cancel: 'engines.claude.project.newArtifactCancel',
            confirm: 'engines.claude.project.newArtifactConfirm',
            busy: 'engines.claude.project.newArtifactSaving',
          }}
          busy={flow.saving}
          onCancel={flow.cancel}
          onConfirm={() => {
            if (!invalid) {
              flow.confirm();
            }
          }}
        />
      }
    >
      <label className="flex flex-col gap-1 text-ui-sm" htmlFor="new-artifact-name">
        {nameLabel}
        <input
          id="new-artifact-name"
          className="rounded-md border border-input bg-background px-2 py-1 font-code text-ui-sm"
          value={flow.name}
          onChange={(event) => {
            flow.setName(event.target.value);
          }}
        />
      </label>
      {flow.nameInvalid && (
        <p role="alert" className="text-ui-xs text-destructive">
          {t('engines.claude.project.newArtifactNameInvalid')}
        </p>
      )}
      {flow.nameTaken && (
        <p role="alert" className="text-ui-xs text-destructive">
          {t('engines.claude.project.newArtifactNameTaken')}
        </p>
      )}
      {flow.error !== null && (
        <p role="alert" className="text-ui-xs text-destructive">
          {t(flow.error.messageKey, flow.error.params)}
        </p>
      )}
    </DialogFrame>
  );
}
