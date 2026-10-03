import { useCallback, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

import { anyOutOfView, goToCard, scrollerOf } from '../lib/request-finder';

/** Whether a question waits out of view, and the way to it. */
export interface RequestsInView {
  /** A card of a request open is scrolled away, or not on screen. */
  readonly outOfView: boolean;

  /** Puts the conversation back if needed, and takes the person to the oldest request. */
  goToOldest(): void;
}

/**
 * Watches the cards of the requests open from where `anchor` stands — the dock of a frame —, so the
 * pill above the box says a question waits whenever its card is not in view (plan 09, B-25, R-02).
 *
 * Measured again after every render and on every scroll of the conversation: a card moves when what
 * is above it grows, when the person scrolls, and when the changes take the conversation's place.
 */
export function useRequestsInView(
  anchor: RefObject<HTMLElement | null>,
  requestIds: readonly string[],
  showChat?: () => void,
): RequestsInView {
  const [outOfView, setOutOfView] = useState(false);

  useLayoutEffect(() => {
    const scroller = scrollerOf(anchor.current);
    const measure = (): void => {
      setOutOfView(anyOutOfView(scroller, requestIds));
    };

    measure();
    scroller?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      scroller?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  });

  const oldest = requestIds[0];

  const goToOldest = useCallback(() => {
    if (oldest !== undefined) {
      showChat?.();
      goToCard(oldest);
    }
  }, [oldest, showChat]);

  return { outOfView, goToOldest };
}
