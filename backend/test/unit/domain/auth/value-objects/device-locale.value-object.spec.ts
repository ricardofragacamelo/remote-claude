import { describe, expect, it } from 'vitest';

import { DEVICE_LOCALES, DeviceLocale, FALLBACK_DEVICE_LOCALE } from '@domain/auth';

describe('DeviceLocale', () => {
  it.each(DEVICE_LOCALES)('keeps %s, which this build speaks', (locale) => {
    expect(DeviceLocale.create(locale).value).toBe(locale);
  });

  // S-11: a device that named no language still gets a push, in English.
  it.each([null, undefined])('falls back to en when the app sent %s', (raw) => {
    expect(DeviceLocale.create(raw).value).toBe(FALLBACK_DEVICE_LOCALE);
  });

  // S-18: and the fallback is a language, never an empty string — a push with no words in it is
  // worse than a push in the wrong language.
  it.each(['fr', 'pt', 'en-GB', '', '  '])('falls back to en for %s, never to empty', (raw) => {
    expect(DeviceLocale.create(raw).value).toBe('en');
    expect(DeviceLocale.create(raw).toString()).not.toBe('');
  });

  it('reads as its value', () => {
    expect(`${DeviceLocale.create('pt-BR').toString()}`).toBe('pt-BR');
  });
});
