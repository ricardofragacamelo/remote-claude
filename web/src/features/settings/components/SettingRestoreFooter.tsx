import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';

export interface SettingRestoreFooterProps {
  /** Translated — named in the "restore" button's own label too. */
  readonly legend: string;

  /** The default's label, translated — shown always, so nobody has to guess what "restore" does. */
  readonly defaultLabel: string;
  readonly isDefault: boolean;
  onRestore(): void;
}

/**
 * The line every option of Settings ends with: its default named, and "restore default" once it
 * is somewhere else (plan 06, S-201) — {@link SettingChoice}'s own footer, and any option that
 * is not a choice among a few values, like a free-text field.
 */
export function SettingRestoreFooter({
  legend,
  defaultLabel,
  isDefault,
  onRestore,
}: SettingRestoreFooterProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-ui-sm text-muted-foreground">
        {t('settings.option.default', { value: defaultLabel })}
      </span>
      {!isDefault && (
        <Button
          variant="outline"
          className="h-8 px-3"
          aria-label={t('settings.option.restoreLabel', { option: legend })}
          onClick={onRestore}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('settings.option.restore')}
        </Button>
      )}
    </div>
  );
}
