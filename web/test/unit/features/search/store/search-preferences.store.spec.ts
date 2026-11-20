import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SEARCH_PREFERENCES,
  initialSearchPreferences,
  searchPreferencesFrom,
  useSearchPreferences,
} from '@/features/search/store/search-preferences.store';

describe('searchPreferencesFrom — plan 11, B-19', () => {
  it('answers undefined for anything that is not a record', () => {
    expect(searchPreferencesFrom(null)).toBeUndefined();
    expect(searchPreferencesFrom('nope')).toBeUndefined();
    expect(searchPreferencesFrom(42)).toBeUndefined();
  });

  it('reads back every field kept as its own type', () => {
    const kept = searchPreferencesFrom({
      exclude: '*.spec.ts',
      useIgnoreFiles: false,
      smartCase: true,
      resultsEditorContextLines: 5,
    });

    expect(kept).toEqual({
      exclude: '*.spec.ts',
      useIgnoreFiles: false,
      smartCase: true,
      resultsEditorContextLines: 5,
    });
  });

  it('falls back to the default for each field that is not one of its own values', () => {
    const kept = searchPreferencesFrom({
      exclude: 42,
      useIgnoreFiles: 'yes',
      smartCase: 'yes',
      resultsEditorContextLines: 99,
    });

    expect(kept).toEqual(DEFAULT_SEARCH_PREFERENCES);
  });

  it('falls back to the default for an object with none of the fields at all', () => {
    expect(searchPreferencesFrom({})).toEqual(DEFAULT_SEARCH_PREFERENCES);
  });
});

describe('initialSearchPreferences', () => {
  it('answers the defaults when the browser keeps nothing', () => {
    const storage = () => ({ getItem: () => null, setItem: () => undefined });

    expect(initialSearchPreferences(storage)).toEqual(DEFAULT_SEARCH_PREFERENCES);
  });

  it('answers the defaults when the browser throws reading it', () => {
    const storage = () => ({
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => undefined,
    });

    expect(initialSearchPreferences(storage)).toEqual(DEFAULT_SEARCH_PREFERENCES);
  });

  it('answers the kept preferences when the browser has a valid one', () => {
    const storage = () => ({
      getItem: () =>
        JSON.stringify({
          exclude: '*.lock',
          useIgnoreFiles: true,
          smartCase: true,
          resultsEditorContextLines: 3,
        }),
      setItem: () => undefined,
    });

    expect(initialSearchPreferences(storage)).toEqual({
      exclude: '*.lock',
      useIgnoreFiles: true,
      smartCase: true,
      resultsEditorContextLines: 3,
    });
  });
});

describe('useSearchPreferences', () => {
  it('starts at the defaults and changes one field at a time, keeping the rest', () => {
    useSearchPreferences.setState({ preferences: DEFAULT_SEARCH_PREFERENCES });

    useSearchPreferences.getState().set('smartCase', true);

    expect(useSearchPreferences.getState().preferences).toEqual({
      ...DEFAULT_SEARCH_PREFERENCES,
      smartCase: true,
    });
  });

  it('keeps working when the browser refuses to keep the change', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };

    try {
      useSearchPreferences.setState({ preferences: DEFAULT_SEARCH_PREFERENCES });
      expect(() => {
        useSearchPreferences.getState().set('useIgnoreFiles', false);
      }).not.toThrow();
      expect(useSearchPreferences.getState().preferences.useIgnoreFiles).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
