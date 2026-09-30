import { DEFAULT_DENSITY, useDensity } from '@/shared/hooks/useDensity';
import type { Density } from '@/shared/hooks/useDensity';
import { defaultLocale, useLocale } from '@/shared/hooks/useLocale';
import { DEFAULT_THEME_PREFERENCE, useTheme } from '@/shared/hooks/useTheme';
import type { ThemePreference } from '@/shared/hooks/useTheme';
import type { Locale } from '@/shared/i18n';

/** One option of Appearance: what is on, what the default is, and the two ways to change it. */
export interface AppearanceOption<T> {
  readonly value: T;

  /** What somebody who never picked has — shown beside the option, always. */
  readonly defaultValue: T;

  /** The option is at its default — there is nothing to restore. */
  readonly isDefault: boolean;

  set(value: T): void;
  restore(): void;
}

/** Theme, language and density — each takes effect at once and is kept for this visitor. */
export interface Appearance {
  readonly theme: AppearanceOption<ThemePreference>;
  readonly language: AppearanceOption<Locale>;
  readonly density: AppearanceOption<Density>;
}

/**
 * The Appearance of the app, as the section of Settings shows it (plan 06, S-143, S-201).
 *
 * Per visitor, never on the server: the phone may want another theme than the desktop
 * ([06 · D-13](../../../../../docs/plans/06-workbench/decisions.md#d-13--onde-vivem-as-configurações-do-app-e-quais-seções-entram)).
 * The language's default is the browser's, so restoring it **forgets** the choice rather than
 * writing the browser's language down — a browser that changes language later is followed.
 */
export function useAppearance(): Appearance {
  const preference = useTheme((state) => state.preference);
  const setPreference = useTheme((state) => state.setPreference);
  const locale = useLocale((state) => state.locale);
  const picked = useLocale((state) => state.picked);
  const setLocale = useLocale((state) => state.setLocale);
  const resetLocale = useLocale((state) => state.reset);
  const density = useDensity((state) => state.density);
  const setDensity = useDensity((state) => state.setDensity);

  return {
    theme: {
      value: preference,
      defaultValue: DEFAULT_THEME_PREFERENCE,
      isDefault: preference === DEFAULT_THEME_PREFERENCE,
      set: setPreference,
      restore: () => {
        setPreference(DEFAULT_THEME_PREFERENCE);
      },
    },
    language: {
      value: locale,
      defaultValue: defaultLocale(),
      isDefault: !picked,
      set: setLocale,
      restore: resetLocale,
    },
    density: {
      value: density,
      defaultValue: DEFAULT_DENSITY,
      isDefault: density === DEFAULT_DENSITY,
      set: setDensity,
      restore: () => {
        setDensity(DEFAULT_DENSITY);
      },
    },
  };
}
