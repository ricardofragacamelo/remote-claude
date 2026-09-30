import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

/** One of the values an option can take, with what it is called on screen. */
export interface Choice<T extends string> {
  readonly value: T;

  /** Translated. */
  readonly label: string;
}

export interface SettingChoiceProps<T extends string> {
  /** The option's id — the element is `setting-<id>`, where the search takes the person. */
  readonly id: string;

  /** Translated. */
  readonly legend: string;
  readonly description: string;
  readonly value: T;
  readonly choices: readonly Choice<T>[];

  /** The default's label, translated — shown always, so nobody has to guess what "restore" does. */
  readonly defaultLabel: string;
  readonly isDefault: boolean;
  onChange(value: T): void;
  onRestore(): void;
}

/**
 * One option of Settings: its values as radio buttons — each takes effect on the click —, the default
 * named beside it, and "restore default" when the option is somewhere else (plan 06, S-201).
 *
 * Radio buttons, not a select: two or three values read at a glance, and the arrow keys move between
 * them as a person who uses the keyboard expects.
 */
export function SettingChoice<T extends string>({
  id,
  legend,
  description,
  value,
  choices,
  defaultLabel,
  isDefault,
  onChange,
  onRestore,
}: SettingChoiceProps<T>): React.JSX.Element {
  const { t } = useTranslation();
  const descriptionId = `setting-${id}-description`;

  return (
    <fieldset
      id={`setting-${id}`}
      tabIndex={-1}
      aria-describedby={descriptionId}
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
    >
      <legend className="px-1 text-ui font-ui-strong">{legend}</legend>
      <p id={descriptionId} className="text-ui text-muted-foreground">
        {description}
      </p>

      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <label
            key={choice.value}
            className={cn(
              'flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-ui md:min-h-8',
              choice.value === value && 'border-primary bg-accent text-accent-foreground',
            )}
          >
            <input
              type="radio"
              name={`setting-${id}`}
              value={choice.value}
              checked={choice.value === value}
              onChange={() => {
                onChange(choice.value);
              }}
            />
            {choice.label}
          </label>
        ))}
      </div>

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
    </fieldset>
  );
}
