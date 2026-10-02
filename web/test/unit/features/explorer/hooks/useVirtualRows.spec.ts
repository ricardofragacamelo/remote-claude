import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  FALLBACK_VIEWPORT,
  OVERSCAN,
  useRowHeight,
  useVirtualRows,
  windowOf,
} from '@/features/explorer/hooks/useVirtualRows';
import { useDensity } from '@/shared/hooks/useDensity';
import { aViewport } from '../../../../support/viewport';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the window of the tree — S-161', () => {
  it('draws what a scroll position shows, with the overscan, inside the list', () => {
    expect(windowOf(10_000, 22, 0, 220)).toEqual({ start: 0, end: 11 + OVERSCAN });
    expect(windowOf(10_000, 22, 22 * 100, 220)).toEqual({
      start: 100 - OVERSCAN,
      end: 111 + OVERSCAN,
    });
    expect(windowOf(5, 22, 0, 220)).toEqual({ start: 0, end: 5 });
    expect(windowOf(10_000, 22, 0, 0).end).toBe(Math.ceil(FALLBACK_VIEWPORT / 22) + 1 + OVERSCAN);
  });

  it('is 22 px dense, 28 px comfortable, and the 44 px touch target on a phone', () => {
    const viewport = aViewport('desktop');
    const { result, rerender } = renderHook(() => useRowHeight());
    expect(result.current).toBe(22);

    act(() => {
      useDensity.setState({ density: 'comfortable' });
    });
    rerender();
    expect(result.current).toBe(28);

    act(() => {
      viewport.phone();
    });
    rerender();
    expect(result.current).toBe(44);
  });

  it('follows the scroll, and the size of the scroller as it changes', () => {
    let resized: () => void = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientHeight', { value: 44 });
    const { result } = renderHook(() => useVirtualRows(1_000, 22, { current: element }));

    act(() => {
      resized();
    });
    expect(result.current.end).toBe(3 + OVERSCAN);

    act(() => {
      result.current.onScroll({ currentTarget: { scrollTop: 22 * 50 } } as never);
    });
    expect(result.current.start).toBe(50 - OVERSCAN);
  });

  it('measures nothing without a scroller', () => {
    const { result } = renderHook(() => useVirtualRows(3, 22, { current: null }));
    expect(result.current).toMatchObject({ start: 0, end: 3 });
  });
});
