import { vi } from 'vitest';

import { DESKTOP_QUERY } from '@/shared/hooks/useMediaQuery';

/** A window the test can resize between a phone and a desktop, telling whoever listens. */
export interface Viewport {
  phone(): void;
  desktop(): void;
}

/**
 * Stands a `matchMedia` in for the browser's — jsdom has none, and without one every screen is the
 * desktop. Only the width of `md` is answered; any other query says no.
 *
 * Restored by `vi.unstubAllGlobals()`.
 */
export function aViewport(start: 'phone' | 'desktop'): Viewport {
  let wide = start === 'desktop';
  const listeners = new Set<() => void>();

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query === DESKTOP_QUERY && wide;
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    })),
  );

  const resize = (next: boolean): void => {
    wide = next;
    for (const listener of [...listeners]) listener();
  };

  return { phone: () => resize(false), desktop: () => resize(true) };
}
