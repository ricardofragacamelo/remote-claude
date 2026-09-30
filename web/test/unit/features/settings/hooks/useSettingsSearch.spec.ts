import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { settingsSections } from '@/features/settings';
import { useSettingsSearch } from '@/features/settings/hooks/useSettingsSearch';
import { providers } from '../../../../support/render';

function search(locale: 'en' | 'pt-BR' = 'en') {
  return renderHook(() => useSettingsSearch(settingsSections.entries()), {
    wrapper: providers(locale),
  });
}

describe('the search of Settings — plan 06, S-203', () => {
  it('finds nothing, and is not searching, while nothing is typed', () => {
    const { result } = search();

    act(() => {
      result.current.setQuery('   ');
    });

    expect(result.current).toMatchObject({ searching: false, matches: [] });
  });

  it('finds an option by its label, whatever the case, with the section it lives in', () => {
    const { result } = search();

    act(() => {
      result.current.setQuery('DENS');
    });

    expect(result.current.matches.map((match) => [match.section.id, match.option.id])).toEqual([
      ['appearance', 'density'],
    ]);
  });

  it('searches every section, not only the one on screen', () => {
    const { result } = search();

    act(() => {
      result.current.setQuery('recent');
    });

    expect(result.current.matches.map((match) => match.section.id)).toEqual(['workspaces']);
  });

  it('searches the labels in the language on screen', () => {
    const { result } = search('pt-BR');

    act(() => {
      result.current.setQuery('idioma');
    });

    expect(result.current.matches.map((match) => match.option.id)).toEqual(['language']);
  });

  it('says it is searching when nothing matches, so the screen can say so', () => {
    const { result } = search();

    act(() => {
      result.current.setQuery('zzz');
    });

    expect(result.current).toMatchObject({ searching: true, matches: [] });
  });
});
