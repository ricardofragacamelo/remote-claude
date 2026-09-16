import i18next from 'i18next';
import type { i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

/** The languages this product speaks. `en` is the source of truth and the fallback. */
export const LOCALES = ['en', 'pt-BR'] as const;

export type Locale = (typeof LOCALES)[number];

/** Whether a string names a language this build has a catalogue for. */
export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * The language for this visitor.
 *
 * Asked for → `en` → the key itself. Never an empty string and never `null`: a missing translation
 * should look like a missing translation, not like a broken layout.
 */
export function resolveLocale(preferred: readonly string[]): Locale {
  for (const candidate of preferred) {
    if (isLocale(candidate)) {
      return candidate;
    }

    const language = candidate.split('-')[0];
    const match = LOCALES.find((locale) => locale.split('-')[0] === language);
    if (match !== undefined) {
      return match;
    }
  }

  return 'en';
}

/**
 * Builds the i18n instance.
 *
 * Interpolation is **named** (`{{path}}`), never positional: word order changes between languages,
 * and a positional placeholder cannot survive that. See docs/architecture/shared/02-i18n.md.
 */
export function createI18n(locale: Locale): i18n {
  const instance = i18next.createInstance();

  void instance.use(initReactI18next).init({
    resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });

  return instance;
}
