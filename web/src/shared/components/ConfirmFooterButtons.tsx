import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';

/**
 * The i18n keys of a simple confirm footer, translated by {@link ConfirmFooterButtons} itself — a
 * caller declares this as a plain module-level constant, never inline in JSX (see
 * `RemoveConfirmDialog`'s own doc for why).
 */
export interface ConfirmFooterKeys {
  readonly cancel: string;
  readonly confirm: string;
  readonly busy: string;
}

export interface ConfirmFooterButtonsProps {
  readonly keys: ConfirmFooterKeys;
  readonly busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}

/**
 * The two buttons of a one-step confirm dialog: a way out, and the action itself, showing its own
 * busy word while in flight. Shared by an engine extension's own `InstallMarketplacePluginDialog` and
 * `PluginUpdateDialog` (plan 13, B-47, B-29).
 */
export function ConfirmFooterButtons({
  keys,
  busy,
  onCancel,
  onConfirm,
}: ConfirmFooterButtonsProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <Button variant="outline" disabled={busy} onClick={onCancel}>
        {t(keys.cancel)}
      </Button>
      <Button disabled={busy} onClick={onConfirm}>
        {busy ? t(keys.busy) : t(keys.confirm)}
      </Button>
    </>
  );
}
