/** The languages a push may go out in. `en` is the source of truth of both catalogues. */
export const DEVICE_LOCALES = ['en', 'pt-BR'] as const;

export type DeviceLocaleValue = (typeof DEVICE_LOCALES)[number];

/** What a device that named no language, or named one we do not speak, gets. */
export const FALLBACK_DEVICE_LOCALE: DeviceLocaleValue = 'en';

/**
 * The language of the **push** of one device.
 *
 * It is a value object rather than a bare string because of the fallback: a push is the one
 * message this backend translates itself, so an absent or unknown locale has to become a language
 * somewhere — and "somewhere" spread over the register endpoint, the notification adapter and the
 * catalogue is three places for it to become an empty string instead (S-11, S-18).
 *
 * See docs/architecture/shared/02-i18n.md.
 */
export class DeviceLocale {
  private constructor(readonly value: DeviceLocaleValue) {}

  /**
   * @param raw what the app sent, which may be absent or a language this build does not speak
   * @returns the language, never a failure — refusing a registration over a locale would keep a
   *   device out of the list for something that has a correct answer
   */
  static create(raw: string | null | undefined): DeviceLocale {
    const known = DEVICE_LOCALES.find((candidate) => candidate === raw);

    return new DeviceLocale(known ?? FALLBACK_DEVICE_LOCALE);
  }

  toString(): string {
    return this.value;
  }
}
