import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useClock } from '@/shared/hooks/useClock';

const NOW = new Date('2026-10-03T12:00:00.000Z');

/** The clock of a countdown or of a turn — plan 09, R-07. */
describe('the clock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is read again every second while it runs', () => {
    const { result } = renderHook(() => useClock());

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(result.current).toBe(NOW.getTime() + 2_000);
  });

  it('stands still while it does not run, and starts when it does', () => {
    const { result, rerender } = renderHook(({ running }) => useClock(running), {
      initialProps: { running: false },
    });

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe(NOW.getTime());

    rerender({ running: true });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(NOW.getTime() + 4_000);
  });
});
