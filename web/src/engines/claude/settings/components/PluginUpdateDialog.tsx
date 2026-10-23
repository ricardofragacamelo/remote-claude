import { useTranslation } from 'react-i18next';

import { DiffHunks } from '@/shared/components/DiffHunks';
import { DialogFrame } from '@/shared/components/DialogFrame';
import { ErrorState } from '@/shared/components/ErrorState';
import type { ConfirmFooterKeys } from '@/shared/components/ConfirmFooterButtons';
import { ConfirmFooterButtons } from '@/shared/components/ConfirmFooterButtons';
import { Button } from '@/shared/components/ui/button';
import type { PluginUpdateFlow } from '../hooks/usePluginUpdateFlow';
import { pluginUpdateDiffHunks } from '../lib/plugin-update-diff';

/** The i18n keys of this dialog's own footer, once an update can actually be applied. */
const FOOTER_KEYS: ConfirmFooterKeys = {
  cancel: 'engines.claude.plugins.updateClose',
  confirm: 'engines.claude.plugins.updateApply',
  busy: 'engines.claude.plugins.updateApplying',
};

export interface PluginUpdateDialogProps {
  readonly flow: PluginUpdateFlow;
}

/**
 * "Atualização disponível" (plan 13, B-47, B-29, S-205): the result of checking one plugin — either
 * it is already current, or the difference the new commit would bring — and, only on the second
 * step, "Apply" actually swaps the commit. Checking never writes anything by itself.
 */
export function PluginUpdateDialog({ flow }: PluginUpdateDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const state = flow.state;
  const canApply = state?.check?.available === true && !state.checking;

  return (
    <DialogFrame
      open={state !== null}
      onClose={flow.cancel}
      title={t('engines.claude.plugins.updateTitle', { name: state?.plugin.name ?? '' })}
      description={t('engines.claude.plugins.updateHint')}
      footer={
        canApply ? (
          <ConfirmFooterButtons
            keys={FOOTER_KEYS}
            busy={state?.applying ?? false}
            onCancel={flow.cancel}
            onConfirm={() => {
              void flow.apply();
            }}
          />
        ) : (
          <Button variant="outline" onClick={flow.cancel}>
            {t('engines.claude.plugins.updateClose')}
          </Button>
        )
      }
    >
      <Body state={state} />
    </DialogFrame>
  );
}

function Body({ state }: { readonly state: PluginUpdateFlow['state'] }): React.JSX.Element | null {
  const { t } = useTranslation();

  if (state === null || state.checking) {
    return null;
  }

  if (state.error !== null) {
    return <ErrorState error={state.error} />;
  }

  // `usePluginUpdateFlow.check()` only ever leaves `checking: false` with either `error` set or
  // `check` set — never neither. Reaching here, `error` was `null`, so `check` is not.
  const check = state.check!;

  if (!check.available) {
    return <p className="text-ui">{t('engines.claude.plugins.updateNone')}</p>;
  }

  return check.diff === null ? (
    <p className="text-ui">{t('engines.claude.plugins.updateAvailableNoDiff')}</p>
  ) : (
    <DiffHunks
      hunks={pluginUpdateDiffHunks(check.diff)}
      label={t('engines.claude.plugins.updateDiffLabel', { name: state.plugin.name })}
    />
  );
}
