import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { DESKTOP_QUERY, useIsDesktop, useMediaQuery } from '@/shared/hooks/useMediaQuery';

/** A `matchMedia` whose answer the test changes, telling whoever listens. */
function aScreen(matches: boolean) {
  const listeners = new Set<() => void>();
  let current = matches;
  const list = {
    get matches() {
      return current;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => list),
  );

  return {
    resize(next: boolean) {
      current = next;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

describe('a media query', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers the fallback where the browser answers no media query at all', () => {
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY, false));

    expect(result.current).toBe(false);
  });

  it('is the desktop where nothing can say — every screen was drawn for it first', () => {
    const { result } = renderHook(() => useIsDesktop());

    expect(result.current).toBe(true);
  });

  it('follows the window as it changes, and stops listening when unmounted', () => {
    const screen = aScreen(true);
    const { result, unmount } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);

    act(() => {
      screen.resize(false);
    });
    expect(result.current).toBe(false);

    unmount();
    expect(screen.listeners.size).toBe(0);
  });
});
