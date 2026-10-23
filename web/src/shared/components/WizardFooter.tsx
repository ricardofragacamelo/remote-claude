import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';

/**
 * The i18n keys of a two-step wizard's footer, translated by {@link WizardFooter} itself — a caller
 * declares this as a plain module-level constant, never inline in JSX (see `RemoveConfirmDialog`'s
 * own doc for why: `pnpm lint:dup` treats JSX attribute values as interchangeable, so two wizards
 * whose attributes differ only in which key each names still read as the same clone).
 */
export interface WizardFooterKeys {
  readonly cancel: string;
  readonly next: string;
  readonly previewing: string;
  readonly back: string;
  readonly confirm: string;
  readonly saving: string;
}

export interface WizardFooterProps {
  readonly step: 'form' | 'preview';
  readonly keys: WizardFooterKeys;

  /** Whether the current step's own request is in flight — disables both buttons either way. */
  readonly busy: boolean;
  onCancel(): void;
  onNext(): void;
  onBack(): void;
  onConfirm(): void;
}

/**
 * The footer of every two-step wizard this product has (plan 13, B-28, B-29): "Cancel"/"Next" on the
 * form step, "Back"/"Confirm" on the preview step — nothing written until the second is pressed
 * (S-132, S-137). Shared by `mcp`'s own `AddEditServerDialog` and an engine extension's own
 * `AddLocalPluginDialog`, rather than each hand-copying the same two button pairs.
 */
export function WizardFooter({
  step,
  keys,
  busy,
  onCancel,
  onNext,
  onBack,
  onConfirm,
}: WizardFooterProps): React.JSX.Element {
  const { t } = useTranslation();

  if (step === 'preview') {
    return (
      <>
        <Button variant="outline" disabled={busy} onClick={onBack}>
          {t(keys.back)}
        </Button>
        <Button disabled={busy} onClick={onConfirm}>
          {busy ? t(keys.saving) : t(keys.confirm)}
        </Button>
      </>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={onCancel}>
        {t(keys.cancel)}
      </Button>
      <Button disabled={busy} onClick={onNext}>
        {busy ? t(keys.previewing) : t(keys.next)}
      </Button>
    </>
  );
}
