import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { APP_HEIGHT_VAR, useVisualViewport } from '@/shared/hooks/useVisualViewport';

/** The visual viewport of a phone, whose keyboard and zoom the test moves. */
function aVisualViewport(height: number) {
  const listeners = new Set<() => void>();
  const viewport = {
    height,
    scale: 1,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('visualViewport', viewport);

  return {
    viewport,
    listeners,
    changed: () => {
      for (const listener of [...listeners]) listener();
    },
  };
}

const height = () => document.documentElement.style.getPropertyValue(APP_HEIGHT_VAR);

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty(APP_HEIGHT_VAR);
});

describe('the frame of the app as tall as what is seen — plan 09, B-08', () => {
  it('follows the keyboard of a phone, and not a zoom — S-15', () => {
    const phone = aVisualViewport(640);
    const { unmount } = renderHook(() => {
      useVisualViewport(true);
    });
    expect(height()).toBe('640px');

    // The keyboard opens: what is left above it is the frame.
    phone.viewport.height = 400;
    phone.changed();
    expect(height()).toBe('400px');

    // A pinch zoom of two shows half as much, and is not a keyboard.
    phone.viewport.height = 320;
    phone.viewport.scale = 2;
    phone.changed();
    expect(height()).toBe('640px');

    // The window resized on its own — a rotation — is read the same way.
    phone.viewport.height = 360;
    phone.viewport.scale = 1;
    globalThis.dispatchEvent(new Event('resize'));
    expect(height()).toBe('360px');

    unmount();
    expect(height()).toBe('');
    expect(phone.listeners.size).toBe(0);
  });

  it('leaves the frame to the window on a desktop', () => {
    const desktop = aVisualViewport(800);
    renderHook(() => {
      useVisualViewport(false);
    });

    expect(height()).toBe('');
    expect(desktop.listeners.size).toBe(0);
  });

  it('does nothing in a browser without a visual viewport', () => {
    vi.stubGlobal('visualViewport', undefined);
    renderHook(() => {
      useVisualViewport(true);
    });

    expect(height()).toBe('');
  });
});
