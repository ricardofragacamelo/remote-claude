import i18next from 'i18next';
import type { i18n } from 'i18next';

import type { DeviceLocaleValue } from '@domain/auth';
import { DEVICE_LOCALES, FALLBACK_DEVICE_LOCALE } from '@domain/auth';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

/**
 * The backend's catalogue, which exists for **one** thing.
 *
 * The rule of this product is that the backend never sends prose: it sends a `code`, a
 * `messageKey` and `params`, and whoever has a screen translates. A push is the single exception,
 * and it is an exception of fact rather than of taste — the payload is rendered by the operating
 * system of the phone, which has no catalogue of ours and no way to be given one
 * (docs/architecture/shared/02-i18n.md#a-única-exceção).
 *
 * The language is the **device's**, recorded when it registered, not the connection's: there is no
 * connection when this is sent. That is the whole point.
 */
export interface PushText {
  readonly title: string;
  readonly body: string;
}

/** Interpolation values. Never a path, never an output — see `PushMessage`. */
export type PushTextParams = Readonly<Record<string, string>>;

/**
 * Renders the two sentences of a push.
 *
 * Built once and reused: `i18next` compiles its interpolation, and a fresh instance per
 * notification would do that work again for every device of every request.
 */
export class PushTranslator {
  private readonly instance: i18n;

  constructor(instance: i18n = createPushI18n()) {
    this.instance = instance;
  }

  /**
   * The title and the body, in `locale`.
   *
   * A language this build does not speak falls back to `en` rather than to the key or to an empty
   * string: a notification with no words is worse than one in the wrong language, and it is what
   * the person actually receives (S-18).
   */
  permission(locale: string, params: PushTextParams): PushText {
    const language = (DEVICE_LOCALES as readonly string[]).includes(locale)
      ? (locale as DeviceLocaleValue)
      : FALLBACK_DEVICE_LOCALE;

    return {
      title: this.instance.t('push.permission.title', { lng: language, ...params }),
      body: this.instance.t('push.permission.body', { lng: language, ...params }),
    };
  }
}

/**
 * The instance, with the two catalogues.
 *
 * Interpolation is **named** (`{{param}}`), never positional: word order changes between
 * languages, and a positional placeholder cannot survive that.
 */
export function createPushI18n(): i18n {
  const instance = i18next.createInstance();

  void instance.init({
    resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
    lng: FALLBACK_DEVICE_LOCALE,
    fallbackLng: FALLBACK_DEVICE_LOCALE,
    interpolation: { escapeValue: false },
    returnNull: false,
  });

  return instance;
}
