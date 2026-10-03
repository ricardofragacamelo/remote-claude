import { useEffect } from 'react';

/** The custom property the frame of the app takes its height from, with `100dvh` behind it. */
export const APP_HEIGHT_VAR = '--app-height';

/**
 * Keeps the frame of the app as tall as what the person sees of it (plan 09, B-08): with the
 * keyboard of a phone open, the visual viewport is what is left above the keyboard, and the box of
 * the chat has to stay there. A pinch zoom changes the visual viewport too, and is not a keyboard:
 * its scale is taken out, so zooming never shrinks the layout.
 *
 * @param enabled only below `md` — on a desktop the window is the viewport
 */
export function useVisualViewport(enabled: boolean): void {
  useEffect(() => {
    const viewport = globalThis.visualViewport;

    if (!enabled || viewport == null) {
      return undefined;
    }

    const root = document.documentElement;
    const apply = (): void => {
      root.style.setProperty(APP_HEIGHT_VAR, `${String(viewport.height * viewport.scale)}px`);
    };

    apply();
    viewport.addEventListener('resize', apply);
    // A window resized without a resize of the visual viewport — a rotation, say — still counts.
    globalThis.addEventListener('resize', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      globalThis.removeEventListener('resize', apply);
      root.style.removeProperty(APP_HEIGHT_VAR);
    };
  }, [enabled]);
}
