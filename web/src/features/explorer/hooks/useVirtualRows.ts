import { useEffect, useState } from 'react';
import type { RefObject, UIEvent } from 'react';

import { useDensity } from '@/shared/hooks/useDensity';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';

/** Rows drawn past each edge of the window, so a fast scroll does not show a blank. */
export const OVERSCAN = 8;

/** What a scroller that measures nothing — a page with no layout yet — is taken to show. */
export const FALLBACK_VIEWPORT = 640;

/**
 * The height of one row, in pixels: the `h-row` of the density from `md` up, and the 44 px touch
 * target below it (web/03). Fixed per layout, which is what lets the window be computed, not measured.
 */
export function useRowHeight(): number {
  const desktop = useIsDesktop();
  const density = useDensity((state) => state.density);

  if (!desktop) {
    return 44;
  }

  return density === 'comfortable' ? 28 : 22;
}

/** The rows to draw: from `start`, up to `end` (excluded). */
export interface VirtualWindow {
  readonly start: number;
  readonly end: number;
}

/** The window of rows a scroll position shows, with the overscan. */
export function windowOf(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewport: number,
): VirtualWindow {
  const height = viewport > 0 ? viewport : FALLBACK_VIEWPORT;
  const first = Math.floor(scrollTop / rowHeight);
  const visible = Math.ceil(height / rowHeight) + 1;

  return {
    start: Math.max(0, first - OVERSCAN),
    end: Math.min(count, first + visible + OVERSCAN),
  };
}

/**
 * The window of a long list — only what is on screen is drawn, so a folder of ten thousand entries
 * costs what a screenful does (S-161). The rows keep their place in the whole list
 * (`aria-setsize`, `aria-posinset`), which is what makes the window invisible to a screen reader.
 *
 * A row is brought into the window by focusing it: the row the keyboard is on is always drawn, and
 * the browser scrolls a focused element into view.
 *
 * @param scroller the element that scrolls — measured as it resizes
 */
export function useVirtualRows(
  count: number,
  rowHeight: number,
  scroller: RefObject<HTMLElement | null>,
): VirtualWindow & { onScroll(event: UIEvent<HTMLElement>): void } {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const element = scroller.current;

    if (element === null || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      setViewport(element.clientHeight);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [scroller]);

  return {
    ...windowOf(count, rowHeight, scrollTop, viewport),
    onScroll: (event) => {
      setScrollTop(event.currentTarget.scrollTop);
    },
  };
}
