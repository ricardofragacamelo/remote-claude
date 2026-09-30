import { useSyncExternalStore } from 'react';

/** Tailwind's `md`: from here up the workbench shows its panels side by side. */
export const DESKTOP_QUERY = '(min-width: 768px)';

/** Whether the browser answers media queries at all — a test environment may not. */
function listOf(query: string): MediaQueryList | null {
  return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query) : null;
}

/**
 * Whether a media query holds, kept up to date as the window changes.
 *
 * The layout decides in JavaScript, and not only in CSS, where the two layouts are different trees —
 * the workbench of one view at a time under `md` is not the desktop one squeezed
 * ([06 · D-08](../../../../docs/plans/06-workbench/decisions.md#d-08--o-workbench-em-tela-pequena)).
 *
 * @param fallback what to answer where there is no `matchMedia` at all
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    (changed) => {
      const list = listOf(query);
      list?.addEventListener('change', changed);
      return () => list?.removeEventListener('change', changed);
    },
    () => listOf(query)?.matches ?? fallback,
  );
}

/**
 * The window is wide enough for the workbench's panels side by side.
 *
 * Without `matchMedia` the answer is the desktop: that is what every screen was drawn for first.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY, true);
}
