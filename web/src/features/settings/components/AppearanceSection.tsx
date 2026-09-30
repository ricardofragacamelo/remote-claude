import { useTranslation } from 'react-i18next';

import type { Density } from '@/shared/hooks/useDensity';
import type { ThemePreference } from '@/shared/hooks/useTheme';
import type { Locale } from '@/shared/i18n';
import { useAppearance } from '../hooks/useAppearance';
import { SettingChoice } from './SettingChoice';
import type { Choice } from './SettingChoice';

/**
 * Appearance: the theme — light, dark or the system's —, the language and the density. Each takes
 * effect on the click and is kept for this browser only (plan 06, S-143).
 */
export function AppearanceSection(): React.JSX.Element {
  const { t } = useTranslation();
  const { theme, language, density } = useAppearance();

  const themes: Readonly<Record<ThemePreference, string>> = {
    system: t('settings.appearance.themeSystem'),
    light: t('settings.appearance.themeLight'),
    dark: t('settings.appearance.themeDark'),
  };
  const languages: Readonly<Record<Locale, string>> = {
    en: t('status.language.en'),
    'pt-BR': t('status.language.ptBR'),
  };
  const densities: Readonly<Record<Density, string>> = {
    compact: t('settings.appearance.densityCompact'),
    comfortable: t('settings.appearance.densityComfortable'),
  };

  return (
    <div className="flex flex-col gap-4">
      <SettingChoice
        id="theme"
        legend={t('settings.appearance.theme')}
        description={t('settings.appearance.themeDescription')}
        value={theme.value}
        choices={choicesOf(themes)}
        defaultLabel={themes[theme.defaultValue]}
        isDefault={theme.isDefault}
        onChange={theme.set}
        onRestore={theme.restore}
      />
      <SettingChoice
        id="language"
        legend={t('settings.appearance.language')}
        description={t('settings.appearance.languageDescription')}
        value={language.value}
        choices={choicesOf(languages)}
        defaultLabel={t('settings.appearance.languageDefault', {
          language: languages[language.defaultValue],
        })}
        isDefault={language.isDefault}
        onChange={language.set}
        onRestore={language.restore}
      />
      <SettingChoice
        id="density"
        legend={t('settings.appearance.density')}
        description={t('settings.appearance.densityDescription')}
        value={density.value}
        choices={choicesOf(densities)}
        defaultLabel={densities[density.defaultValue]}
        isDefault={density.isDefault}
        onChange={density.set}
        onRestore={density.restore}
      />
    </div>
  );
}

/** The values of an option, in the order they are declared, each with its label. */
function choicesOf<T extends string>(labels: Readonly<Record<T, string>>): readonly Choice<T>[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
