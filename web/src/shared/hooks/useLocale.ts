import { create } from 'zustand';

import { isLocale, resolveLocale } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';
import { forgetVisitor, readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';
import type { StorageSource } from '@/shared/lib/visitor-storage';

const LOCALE_KEY = 'locale';

/** The languages the browser says it reads — `en` where it says nothing, as some embedded ones do. */
function browserLanguages(): readonly string[] {
  return (navigator.languages as readonly string[] | undefined) ?? ['en'];
}

/** The language this browser kept for somebody who picked one — nothing when nobody did. */
function pickedLocale(storage?: StorageSource): Locale | undefined {
  return readVisitor(
    LOCALE_KEY,
    (value) => (typeof value === 'string' && isLocale(value) ? value : undefined),
    storage,
  );
}

/** The language a visitor has without picking one: the browser's, when it is one of ours. */
export function defaultLocale(languages: () => readonly string[] = browserLanguages): Locale {
  return resolveLocale(languages());
}

/**
 * The language a visitor starts with: the one they picked here, and otherwise the browser's.
 *
 * Per visitor, and not the user's on the server: the language of a push is the device's own
 * (`Device.locale`), which is another fact ([06 · D-13](../../../../docs/plans/06-workbench/decisions.md#d-13--onde-vivem-as-configurações-do-app-e-quais-seções-entram)).
 */
export function initialLocale(
  storage?: StorageSource,
  languages: () => readonly string[] = browserLanguages,
): Locale {
  return pickedLocale(storage) ?? defaultLocale(languages);
}

/** Whether this browser kept a language somebody picked — `false` where it cannot say. */
export function localePicked(storage?: StorageSource): boolean {
  return pickedLocale(storage) !== undefined;
}

export interface LocaleState {
  readonly locale: Locale;

  /** Somebody picked the language here, rather than taking the browser's. */
  readonly picked: boolean;

  /** Picks a language, and keeps the choice for this browser. */
  setLocale(locale: Locale): void;

  /** Forgets the choice: the browser's language again — "restore the default". */
  reset(): void;
}

/** The language of the interface — shared by the whole app, so a store of its own. */
export const useLocale = create<LocaleState>((set) => ({
  locale: initialLocale(),
  picked: localePicked(),

  setLocale: (locale) => {
    writeVisitor(LOCALE_KEY, locale);
    set({ locale, picked: true });
  },

  reset: () => {
    forgetVisitor(LOCALE_KEY);
    set({ locale: defaultLocale(), picked: false });
  },
}));
