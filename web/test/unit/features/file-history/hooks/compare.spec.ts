import { afterEach, describe, expect, it, vi } from 'vitest';

import { compareVersions } from '@/features/file-history/hooks/compare';
import { forgetTimeline, timelineStore } from '@/features/file-history/store/timeline.store';
import type { HistoryEntry } from '@/features/file-history/types/history';
import { editorStoreOf } from '@/features/editor/store/editor.store';

const APP = '/srv/app';

afterEach(() => {
  forgetTimeline(null);
  vi.restoreAllMocks();
});

function version(id: string, at: string): HistoryEntry {
  return {
    id,
    path: 'a.ts',
    entryKind: 'file',
    reason: 'save',
    kept: 'yes',
    sizeBytes: 1,
    author: { self: true, id: 'me' },
    at,
    batchId: null,
  };
}

describe('comparing two versions — plan 07, S-346', () => {
  it.each([
    ['the older picked first', 'old', 'new'],
    ['the newer picked first', 'new', 'old'],
  ])('puts the older at the left, %s', (_, first, second) => {
    const versions: Record<string, HistoryEntry> = {
      old: version('h-1', '2026-10-01T10:00:00.000Z'),
      new: version('h-2', '2026-10-01T11:00:00.000Z'),
    };
    timelineStore(APP)
      .getState()
      .select(versions[first] ?? null);

    compareVersions(APP, versions[first] as HistoryEntry, versions[second] as HistoryEntry);

    const group = editorStoreOf(APP).getState().groups[0];
    const tab = group?.tabs.find((each) => each.kind === 'diff');
    expect(tab).toMatchObject({
      left: { source: 'history', version: { entryId: 'h-1' } },
      right: { source: 'history', version: { entryId: 'h-2' } },
    });
    expect(timelineStore(APP).getState().selected).toBeNull();
  });
});
