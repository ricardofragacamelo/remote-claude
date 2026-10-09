import { afterEach, describe, expect, it } from 'vitest';

import { FRESH_READER, readerMemoryOf, rememberReader } from '@/features/editor/hooks/pdf-memory';
import {
  ZOOM_STEPS,
  atLargest,
  atSmallest,
  percentOf,
  scaleOfOption,
  zoomOption,
  zoomedIn,
  zoomedOut,
} from '@/features/editor/lib/pdf-zoom';
import { forgetEditor } from '@/features/editor/store/editor.store';
import {
  activePdfReader,
  leavePdfReader,
  reachPdfReader,
} from '@/features/editor/store/pdf-readers';
import type { PdfReaderHandle } from '@/features/editor/store/pdf-readers';

afterEach(() => {
  forgetEditor(null);
});

describe('the steps of the zoom — plan 21, D-09, S-12', () => {
  it('are 25 % to 500 %, the ones of Firefox trimmed', () => {
    expect(ZOOM_STEPS.map(percentOf)).toEqual([25, 50, 75, 100, 125, 150, 200, 300, 400, 500]);
  });

  it('go to the step past or before a factor — a fit between two steps included', () => {
    expect([zoomedIn(1), zoomedIn(1.3), zoomedIn(0.1)]).toEqual([1.25, 1.5, 0.25]);
    expect([zoomedOut(1), zoomedOut(1.3), zoomedOut(7)]).toEqual([0.75, 1.25, 5]);
    // A fit computed a hair off a step is that step.
    expect([zoomedIn(1.2499), zoomedOut(1.2501)]).toEqual([1.5, 1]);
  });

  it('stop at the ends', () => {
    expect([zoomedIn(5), zoomedOut(0.25)]).toEqual([null, null]);
    expect([atSmallest(0.25), atSmallest(0.2), atSmallest(0.5)]).toEqual([true, true, false]);
    expect([atLargest(5), atLargest(6), atLargest(4)]).toEqual([true, true, false]);
  });

  it('name a scale in the list, and read it back', () => {
    for (const scale of ['auto', 'page-width', 'page-fit', 1.5, 0.25] as const) {
      expect(scaleOfOption(zoomOption(scale))).toBe(scale);
    }
  });
});

describe('what the reader of a tab remembers — plan 21, D-06', () => {
  it('starts fresh, and keeps each part per tab', () => {
    expect(readerMemoryOf('/f', 'g/a')).toBeNull();

    rememberReader('/f', 'g/a', { page: 4 });
    rememberReader('/f', 'g/a', { scale: 2 });
    rememberReader('/f', 'g/b', { sidebar: { open: true, tab: 'outline' } });

    expect(readerMemoryOf('/f', 'g/a')).toEqual({ ...FRESH_READER, page: 4, scale: 2 });
    expect(readerMemoryOf('/f', 'g/b')).toEqual({
      ...FRESH_READER,
      sidebar: { open: true, tab: 'outline' },
    });
    expect(readerMemoryOf('/other', 'g/a')).toBeNull();
  });
});

describe('the reader the commands act on — plan 21, S-14', () => {
  const handle = (): PdfReaderHandle => ({
    zoomIn: () => undefined,
    zoomOut: () => undefined,
    zoomReset: () => undefined,
    openFind: () => undefined,
  });

  it('is the one reached last, while it is on screen', () => {
    const first = handle();
    const second = handle();
    expect(activePdfReader()).toBeNull();

    reachPdfReader(first);
    reachPdfReader(second);
    expect(activePdfReader()).toBe(second);
    reachPdfReader(first);
    expect(activePdfReader()).toBe(first);

    leavePdfReader(first);
    expect(activePdfReader()).toBe(second);
    leavePdfReader(second);
    expect(activePdfReader()).toBeNull();
  });
});
