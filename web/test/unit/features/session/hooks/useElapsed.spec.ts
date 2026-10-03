import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useElapsed } from '@/features/session/hooks/useElapsed';

const NOW = new Date('2026-10-03T12:00:00.000Z');

/** The clock of the indicator — plan 09, B-21, R-07. */
describe('the elapsed time of a turn', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts whole seconds from the instant the server gave, every second', () => {
    const { result } = renderHook(() => useElapsed('2026-10-03T11:59:50.000Z'));
    expect(result.current).toBe(10);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(result.current).toBe(13);
  });

  it('counts from when it was first asked, when the instant is not known', () => {
    const { result } = renderHook(() => useElapsed(null));
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe(2);
  });

  it('reads an instant it cannot parse as unknown, and never counts below zero', () => {
    expect(renderHook(() => useElapsed('not a date')).result.current).toBe(0);
    expect(renderHook(() => useElapsed('2026-10-03T12:00:30.000Z')).result.current).toBe(0);
  });

  it('stops its clock when it goes', () => {
    const cleared = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useElapsed(null));

    unmount();

    expect(cleared).toHaveBeenCalled();
  });
});
