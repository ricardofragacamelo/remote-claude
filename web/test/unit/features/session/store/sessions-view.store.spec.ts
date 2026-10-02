import { describe, expect, it } from 'vitest';

import {
  keptSessionsViewFrom,
  SESSIONS_VIEW_RESTORER,
} from '@/features/session/store/sessions-view-restorer';
import {
  forgetSessionsView,
  sessionsViewStore,
} from '@/features/session/store/sessions-view.store';

/** The state of the view of a folder tab — plan 08, B-09. */
describe('the view of a folder tab', () => {
  it('is one per folder: the filter of one tab is not the other’s — S-38', () => {
    sessionsViewStore('/a').getState().setSearch('deploy');
    sessionsViewStore('/a').getState().setOrigin('ours');

    expect(sessionsViewStore('/b').getState()).toMatchObject({ search: '', origin: 'all' });
    expect(sessionsViewStore('/a')).toBe(sessionsViewStore('/a'));
  });

  it('folds and unfolds a group, and keeps every other setting it is given', () => {
    const view = sessionsViewStore('/a').getState();
    view.toggleGroup('history');
    view.setSort('name');
    view.setIncludeSubfolders(true);
    view.select('row-1');
    view.setScrollTop(120);
    view.setHelpOpen(true);

    expect(sessionsViewStore('/a').getState()).toMatchObject({
      sort: 'name',
      includeSubfolders: true,
      selected: 'row-1',
      scrollTop: 120,
      helpOpen: true,
    });
    expect(sessionsViewStore('/a').getState().collapsed.has('history')).toBe(true);

    sessionsViewStore('/a').getState().toggleGroup('history');
    expect(sessionsViewStore('/a').getState().collapsed.has('history')).toBe(false);
  });

  it('clears the search and the origin, and nothing else', () => {
    const view = sessionsViewStore('/a').getState();
    view.setSearch('x');
    view.setOrigin('external');
    view.setSort('name');
    view.clearFilters();

    expect(sessionsViewStore('/a').getState()).toMatchObject({
      search: '',
      origin: 'all',
      sort: 'name',
    });
  });

  it('goes with its tab, or with every tab', () => {
    sessionsViewStore('/a').getState().setSearch('x');
    sessionsViewStore('/b').getState().setSearch('y');

    forgetSessionsView('/a');
    expect(sessionsViewStore('/a').getState().search).toBe('');
    expect(sessionsViewStore('/b').getState().search).toBe('y');

    forgetSessionsView(null);
    expect(sessionsViewStore('/b').getState().search).toBe('');
  });
});

describe('what a reload gives the view back', () => {
  it('keeps how it was narrowed and folded — never the search', () => {
    const view = sessionsViewStore('/a').getState();
    view.setOrigin('ours');
    view.setSort('name');
    view.setIncludeSubfolders(true);
    view.toggleGroup('elsewhere');
    view.setSearch('secret');

    const kept = SESSIONS_VIEW_RESTORER.capture('/a');
    expect(kept).toEqual({
      origin: 'ours',
      sort: 'name',
      includeSubfolders: true,
      collapsed: ['elsewhere'],
    });

    forgetSessionsView(null);
    SESSIONS_VIEW_RESTORER.apply('/a', kept);
    expect(sessionsViewStore('/a').getState()).toMatchObject({
      origin: 'ours',
      sort: 'name',
      search: '',
    });
    expect(sessionsViewStore('/a').getState().collapsed.has('elsewhere')).toBe(true);
  });

  it('reads what it cannot trust as the defaults', () => {
    expect(keptSessionsViewFrom('nope')).toBeUndefined();
    expect(
      keptSessionsViewFrom({ origin: 'mine', sort: 7, includeSubfolders: 'yes', collapsed: 'x' }),
    ).toEqual({
      origin: 'all',
      sort: 'recent',
      includeSubfolders: false,
      collapsed: [],
    });
    expect(keptSessionsViewFrom({ collapsed: ['history', 'nowhere'] })?.collapsed).toEqual([
      'history',
    ]);
  });

  it('reads back what it kept', () => {
    expect(
      keptSessionsViewFrom({ origin: 'external', sort: 'name', includeSubfolders: true }),
    ).toEqual({ origin: 'external', sort: 'name', includeSubfolders: true, collapsed: [] });
  });

  it('hears every change of the store of its tab', () => {
    let heard = 0;
    const stop = SESSIONS_VIEW_RESTORER.subscribe('/a', () => {
      heard += 1;
    });
    sessionsViewStore('/a').getState().setSort('name');
    stop();

    expect(heard).toBe(1);
  });
});
