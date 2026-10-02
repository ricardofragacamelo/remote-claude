import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXPLORER_RESTORER, keptExplorerFrom } from '@/features/explorer/store/explorer-restorer';
import { explorerStore, forgetExplorer } from '@/features/explorer/store/explorer.store';

const APP = '/srv/app';

afterEach(() => {
  forgetExplorer(null);
});

describe('what a reload gives the Explorer back — B-24', () => {
  it('keeps paths and options, never the undo stack', () => {
    const store = explorerStore(APP).getState();
    store.expand('src');
    store.select(['src/a.ts'], 'src/a.ts');
    store.setShowHidden(true);
    store.pushUndo({ kind: 'create', items: [{ path: 'x', etag: null }] });

    const kept = EXPLORER_RESTORER.capture(APP);

    expect(kept).toEqual({
      expanded: ['', 'src'],
      selection: ['src/a.ts'],
      focused: 'src/a.ts',
      showHidden: true,
      sort: 'name',
      compact: true,
    });
    expect(JSON.stringify(kept)).not.toContain('undo');
  });

  it('puts it back, the folder itself open', () => {
    EXPLORER_RESTORER.apply(APP, {
      expanded: ['src'],
      selection: ['src/a.ts'],
      focused: 'src/a.ts',
      showHidden: true,
      sort: 'modified',
      compact: false,
    });

    const state = explorerStore(APP).getState();
    expect([...state.expanded]).toEqual(['', 'src']);
    expect(state).toMatchObject({ anchor: 'src/a.ts', sort: 'modified', compact: false, undo: [] });
  });

  it('reads what it can trust, and defaults the rest', () => {
    expect(keptExplorerFrom(null)).toBeUndefined();
    expect(keptExplorerFrom('nope')).toBeUndefined();
    expect(
      keptExplorerFrom({ expanded: ['a', 3], selection: 'x', sort: 'size', compact: 'no' }),
    ).toEqual({
      expanded: ['a'],
      selection: [],
      focused: null,
      showHidden: false,
      sort: 'name',
      compact: true,
    });
    expect(
      keptExplorerFrom({ focused: 'a', sort: 'type', compact: false, showHidden: true }),
    ).toMatchObject({
      focused: 'a',
      sort: 'type',
      compact: false,
      showHidden: true,
    });
  });

  it('is told of every change, and lets go of a tab', () => {
    const listener = vi.fn();
    const stop = EXPLORER_RESTORER.subscribe(APP, listener);

    explorerStore(APP).getState().expand('lib');
    stop();
    explorerStore(APP).getState().expand('more');
    expect(listener).toHaveBeenCalledTimes(1);

    const before = explorerStore(APP);
    EXPLORER_RESTORER.forget?.(APP);
    expect(explorerStore(APP)).not.toBe(before);
  });
});
