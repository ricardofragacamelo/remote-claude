import { describe, expect, it } from 'vitest';

import { defaultLocale, initialLocale, localePicked, useLocale } from '@/shared/hooks/useLocale';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import type { VisitorStorage } from '@/shared/lib/visitor-storage';

function saved(value: string | null): () => VisitorStorage {
  return () => ({ getItem: () => value, setItem: () => undefined });
}

const blocked = (): VisitorStorage => {
  throw new DOMException('blocked', 'SecurityError');
};

describe('the language a visitor starts with', () => {
  it('is the one picked here, whatever the browser says', () => {
    expect(initialLocale(saved('"pt-BR"'), () => ['en'])).toBe('pt-BR');
  });

  it('is the browser’s when nothing was picked', () => {
    expect(initialLocale(saved(null), () => ['pt-PT', 'en'])).toBe('pt-BR');
  });

  it('ignores a saved language this build has no catalogue for', () => {
    expect(initialLocale(saved('"de"'), () => ['en'])).toBe('en');
    expect(initialLocale(saved('42'), () => ['pt-BR'])).toBe('pt-BR');
  });

  it('falls back to the browser when the storage throws', () => {
    expect(initialLocale(blocked, () => ['pt-BR'])).toBe('pt-BR');
  });
});

describe('picking a language', () => {
  it('keeps the choice for this browser', () => {
    useLocale.getState().setLocale('pt-BR');

    expect(useLocale.getState().locale).toBe('pt-BR');
    expect(localStorage.getItem(`${VISITOR_PREFIX}locale`)).toBe('"pt-BR"');
  });
});

describe('the default language, and restoring it — plan 06, S-201', () => {
  it('is the browser’s', () => {
    expect(defaultLocale(() => ['pt-BR'])).toBe('pt-BR');
    expect(defaultLocale(() => ['de'])).toBe('en');
  });

  it('knows whether somebody picked one here', () => {
    expect(localePicked(saved('"pt-BR"'))).toBe(true);
    expect(localePicked(saved(null))).toBe(false);
    expect(localePicked(saved('"de"'))).toBe(false);
    expect(localePicked(blocked)).toBe(false);
  });

  it('marks the language as picked once somebody picks one', () => {
    useLocale.getState().setLocale('en');

    expect(useLocale.getState().picked).toBe(true);
  });

  it('forgets the choice on restore, and takes the browser’s language again', () => {
    useLocale.getState().setLocale('pt-BR');

    useLocale.getState().reset();

    expect(localStorage.getItem(`${VISITOR_PREFIX}locale`)).toBeNull();
    expect(useLocale.getState()).toMatchObject({ picked: false, locale: defaultLocale() });
  });
});
