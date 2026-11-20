import { afterEach, describe, expect, it } from 'vitest';

import { baseQueryOf, globsOf } from '@/features/search/lib/query-fields';
import {
  DEFAULT_SEARCH_PREFERENCES,
  useSearchPreferences,
} from '@/features/search/store/search-preferences.store';
import type { QueryFields } from '@/features/search/lib/query-fields';

function aState(overrides: Partial<QueryFields> = {}): QueryFields {
  return {
    query: 'todo',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: '',
    useIgnoreFiles: true,
    ...overrides,
  };
}

afterEach(() => {
  useSearchPreferences.setState({ preferences: DEFAULT_SEARCH_PREFERENCES });
});

describe('globsOf', () => {
  it('splits a comma list, trimmed, dropping blanks', () => {
    expect(globsOf(' *.ts , src/**/include ,, ')).toEqual(['*.ts', 'src/**/include']);
  });

  it('answers undefined for an empty field, so the request leaves it out entirely', () => {
    expect(globsOf('')).toBeUndefined();
    expect(globsOf('  ,  ')).toBeUndefined();
  });
});

describe('baseQueryOf', () => {
  it('passes the flags and filters straight through, with no smart case on', () => {
    const query = baseQueryOf(aState({ include: '*.ts', exclude: '*.spec.ts' }));

    expect(query).toMatchObject({
      pattern: 'todo',
      isRegex: false,
      caseSensitive: false,
      wholeWord: false,
      include: ['*.ts'],
      exclude: ['*.spec.ts'],
    });
  });

  it('leaves `caseSensitive` alone when the toggle is already on, smart case or not', () => {
    useSearchPreferences.getState().set('smartCase', true);

    expect(baseQueryOf(aState({ query: 'todo', caseSensitive: true })).caseSensitive).toBe(true);
  });

  it('turns case sensitivity on by itself when "caixa inteligente" is on and the query has an upper-case letter — B-19', () => {
    useSearchPreferences.getState().set('smartCase', true);

    expect(baseQueryOf(aState({ query: 'TODO', caseSensitive: false })).caseSensitive).toBe(true);
  });

  it('stays case-insensitive with smart case on but no upper-case letter in the query', () => {
    useSearchPreferences.getState().set('smartCase', true);

    expect(baseQueryOf(aState({ query: 'todo', caseSensitive: false })).caseSensitive).toBe(false);
  });

  it('never turns case sensitivity on by itself with smart case off, whatever the query is', () => {
    useSearchPreferences.getState().set('smartCase', false);

    expect(baseQueryOf(aState({ query: 'TODO', caseSensitive: false })).caseSensitive).toBe(false);
  });
});
