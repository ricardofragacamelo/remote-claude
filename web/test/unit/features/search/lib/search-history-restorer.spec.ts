import { describe, expect, it } from 'vitest';

import { SEARCH_HISTORY_RESTORER } from '@/features/search/lib/search-history-restorer';
import { forgetSearchView, searchViewStore } from '@/features/search/store/search-view.store';

const FOLDER = '/srv/projects/a';

describe('SEARCH_HISTORY_RESTORER — plan 11, B-18, S-134, S-137', () => {
  it('captures the folder’s own history, nothing else', () => {
    forgetSearchView(FOLDER);
    searchViewStore(FOLDER).getState().pushHistory('TODO');
    searchViewStore(FOLDER).getState().setQuery('live, unsaved typing');

    expect(SEARCH_HISTORY_RESTORER.capture(FOLDER)).toEqual(['TODO']);
  });

  it('applies a kept history back to the folder’s own store', () => {
    forgetSearchView(FOLDER);

    SEARCH_HISTORY_RESTORER.apply(FOLDER, ['TODO', 'FIXME']);

    expect(searchViewStore(FOLDER).getState().history).toEqual(['TODO', 'FIXME']);
  });

  it('trusts a kept array of strings, and nothing else', () => {
    expect(SEARCH_HISTORY_RESTORER.parse(['TODO', 'FIXME'])).toEqual(['TODO', 'FIXME']);
    expect(SEARCH_HISTORY_RESTORER.parse('TODO')).toBeUndefined();
    expect(SEARCH_HISTORY_RESTORER.parse([1, 2])).toBeUndefined();
    expect(SEARCH_HISTORY_RESTORER.parse(null)).toBeUndefined();
    expect(SEARCH_HISTORY_RESTORER.parse(undefined)).toBeUndefined();
  });

  it('tells the listener again whenever the folder’s own store changes', () => {
    forgetSearchView(FOLDER);
    let told = 0;
    const stop = SEARCH_HISTORY_RESTORER.subscribe(FOLDER, () => {
      told += 1;
    });

    searchViewStore(FOLDER).getState().pushHistory('TODO');
    expect(told).toBeGreaterThan(0);

    stop();
  });
});
