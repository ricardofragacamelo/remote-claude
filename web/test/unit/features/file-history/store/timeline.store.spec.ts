import { afterEach, describe, expect, it } from 'vitest';

import { forgetTimeline, timelineStore } from '@/features/file-history/store/timeline.store';
import type { HistoryEntry } from '@/features/file-history/types/history';

const APP = '/srv/app';

afterEach(() => {
  forgetTimeline(null);
});

const entry: HistoryEntry = {
  id: 'h-1',
  path: 'a.ts',
  entryKind: 'file',
  reason: 'save',
  kept: 'yes',
  sizeBytes: 1,
  author: { self: true, id: 'me' },
  at: '2026-10-01T10:00:00.000Z',
  batchId: null,
};

describe('the Timeline of a folder tab — plan 07, B-59', () => {
  it('follows the active file, never back to nothing, and lets a picked version go', () => {
    const store = timelineStore(APP);
    store.getState().follow('a.ts');
    store.getState().select(entry);

    store.getState().follow(null);
    expect(store.getState().subject).toEqual({ path: 'a.ts', gone: false });
    expect(store.getState().selected).toBe(entry);

    store.getState().follow('a.ts');
    expect(store.getState().selected).toBe(entry);

    store.getState().follow('b.ts');
    expect(store.getState()).toMatchObject({
      subject: { path: 'b.ts', gone: false },
      selected: null,
    });
  });

  it('reaches the versions of a file that no longer exists, and follows the file again', () => {
    const store = timelineStore(APP);
    store.getState().setMode('deleted');
    store.getState().setReason('save');

    store.getState().showGone('old.ts');
    expect(store.getState()).toMatchObject({
      subject: { path: 'old.ts', gone: true },
      mode: 'file',
      reason: null,
    });

    store.getState().follow('old.ts');
    expect(store.getState().subject).toEqual({ path: 'old.ts', gone: false });
  });

  it('opens in a mode and asks for the focus each time it is revealed', () => {
    const store = timelineStore(APP);

    store.getState().reveal('deleted');
    store.getState().reveal('file');

    expect(store.getState()).toMatchObject({ open: true, mode: 'file', focusRequest: 2 });
  });

  it('is one per folder, and forgets one folder or every one', () => {
    const first = timelineStore(APP);
    expect(timelineStore(APP)).toBe(first);
    expect(timelineStore('/srv/other')).not.toBe(first);

    forgetTimeline(APP);
    expect(timelineStore(APP)).not.toBe(first);

    const other = timelineStore('/srv/other');
    forgetTimeline(null);
    expect(timelineStore('/srv/other')).not.toBe(other);
  });
});
