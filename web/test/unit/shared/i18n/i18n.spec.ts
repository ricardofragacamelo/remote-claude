import { describe, expect, it } from 'vitest';

import { LOCALES, createI18n, isLocale, resolveLocale } from '@/shared/i18n';
import en from '@/shared/i18n/locales/en.json';
import ptBR from '@/shared/i18n/locales/pt-BR.json';

/** Every leaf of a catalogue, as dotted keys. */
function keysOf(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) {
    return [prefix];
  }

  return Object.entries(node).flatMap(([key, value]) =>
    keysOf(value, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/** Named placeholders used by a string. */
function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
}

/** Every leaf value of a catalogue, by key. */
function leavesOf(node: unknown, prefix = ''): Map<string, string> {
  if (typeof node !== 'object' || node === null) {
    return new Map([[prefix, String(node)]]);
  }

  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(node)) {
    for (const [k, v] of leavesOf(value, prefix === '' ? key : `${prefix}.${key}`)) {
      out.set(k, v);
    }
  }

  return out;
}

describe('the catalogues', () => {
  it('have exactly the same keys in both languages', () => {
    expect(keysOf(ptBR).sort()).toEqual(keysOf(en).sort());
  });

  it('interpolate the same named parameters in both', () => {
    const english = leavesOf(en);

    for (const [key, translated] of leavesOf(ptBR)) {
      expect(paramsOf(translated), key).toEqual(paramsOf(english.get(key) ?? ''));
    }
  });

  it('never interpolate by position, which no translator could reorder', () => {
    for (const [key, value] of leavesOf(en)) {
      expect(value, key).not.toMatch(/\{\{\d+\}\}/);
    }
  });

  it('nest no deeper than three segments', () => {
    for (const key of keysOf(en)) {
      expect(key.split('.'), key).toHaveLength(3);
    }
  });
});

describe('resolveLocale', () => {
  it.each([
    [['pt-BR'], 'pt-BR'],
    [['en'], 'en'],
    [['pt'], 'pt-BR'],
    [['pt-PT'], 'pt-BR'],
    [['en-GB'], 'en'],
    [['de', 'pt-BR'], 'pt-BR'],
    [['de'], 'en'],
    [[], 'en'],
  ])('resolves %j to %s', (preferred, expected) => {
    expect(resolveLocale(preferred)).toBe(expected);
  });
});

describe('isLocale', () => {
  it.each(LOCALES)('recognises %s', (locale) => {
    expect(isLocale(locale)).toBe(true);
  });

  it('does not recognise a language with no catalogue', () => {
    expect(isLocale('de')).toBe(false);
  });
});

describe('createI18n', () => {
  it('translates in the language it was built for', () => {
    expect(createI18n('pt-BR').t('common.action.retry')).toBe('Tentar de novo');
  });

  it('interpolates by name', () => {
    expect(createI18n('en').t('common.error.traceLabel', { traceId: 'abc' })).toBe('Trace abc');
  });

  it('falls back to English rather than to an empty string', () => {
    const instance = createI18n('pt-BR');

    expect(instance.t('session.ping.title', { lng: 'de' })).toBe('Round trip');
  });

  it('answers the key itself when there is no translation at all', () => {
    expect(createI18n('en').t('nothing.like.this')).toBe('nothing.like.this');
  });
});
