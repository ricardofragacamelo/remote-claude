import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import type { ConfirmFooterKeys } from '@/shared/components/ConfirmFooterButtons';
import { ConfirmFooterButtons } from '@/shared/components/ConfirmFooterButtons';
import { DialogFrame } from '@/shared/components/DialogFrame';
import type { InstallMarketplaceFlow } from '../hooks/useInstallMarketplaceFlow';

/** The i18n keys of this dialog's own footer — declared once, outside any JSX. */
const FOOTER_KEYS: ConfirmFooterKeys = {
  cancel: 'engines.claude.marketplace.installCancel',
  confirm: 'engines.claude.marketplace.install',
  busy: 'engines.claude.marketplace.installing',
};

export interface InstallMarketplacePluginDialogProps {
  readonly flow: InstallMarketplaceFlow;
}

/**
 * The confirm of installing a plugin from a declared marketplace (plan 13, B-47, B-29, S-212):
 * chosen already, from the catalogue on screen — this dialog only confirms. There is no network
 * preview to show first the way the local-add wizard has (`services/plugin.service.ts`'s own doc on
 * `installMarketplacePlugin` explains why: a catalogue entry carries only a name, a description and
 * whether it is supported — nothing to preview beyond what the catalogue already showed). Nothing is
 * downloaded until "Install" is pressed.
 */
export function InstallMarketplacePluginDialog({
  flow,
}: InstallMarketplacePluginDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const state = flow.state;

  return (
    <DialogFrame
      open={state !== null}
      onClose={flow.cancel}
      title={t('engines.claude.marketplace.installTitle', { name: state?.entry.name ?? '' })}
      description={t('engines.claude.marketplace.installHint', {
        marketplace: state?.marketplace ?? '',
      })}
      footer={
        <ConfirmFooterButtons
          keys={FOOTER_KEYS}
          busy={state?.installing ?? false}
          onCancel={flow.cancel}
          onConfirm={() => {
            void flow.confirm();
          }}
        />
      }
    >
      {state !== null && (
        <div className="flex flex-col gap-2">
          {state.entry.description !== null && <p className="text-ui">{state.entry.description}</p>}
          {state.error !== null && <ErrorState error={state.error} />}
        </div>
      )}
    </DialogFrame>
  );
}
