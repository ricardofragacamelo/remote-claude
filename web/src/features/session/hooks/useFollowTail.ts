import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { ScrollMemory } from '../store/claude-panel.store';

/** How near the end counts as "at the end": a line of slack, so a rounding is not a scroll up. */
const SLACK_PX = 24;

/** Whether a scrolled element shows its end. */
export function atEnd(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= SLACK_PX;
}

/** Where a scroller was left, kept by whoever outlives it — the panel of the folder tab. */
export interface ScrollKeeper {
  /**
   * What is being scrolled: a new key is new content, restored from what it kept. A keeper is the
   * same object for as long as its key is — a new one restores again.
   */
  readonly key: string;
  read(): ScrollMemory | undefined;
  write(memory: ScrollMemory): void;
}

/**
 * Keeps the end of a conversation in view as it grows — **while the person is there**: once they
 * scrolled up to read, what arrives does not pull them down again, and coming back to the end
 * follows once more (plan 08, S-81; plan 09, S-07).
 *
 * It watches **the scroller itself** — the one element of the panel that scrolls (plan 09, B-05) —
 * and the size of what is in it, not a render: a delta, a lazy block of code or a box that grew
 * under it all move the end, and none of them has to tell.
 *
 * Without a keeper, the scroller starts at the top and follows nothing — the changes of a session,
 * say. With one, it starts where the person left it, or at the end the first time (S-08, S-16).
 */
export function useFollowTail(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  keeper: ScrollKeeper | null,
): void {
  const following = useRef(false);

  useLayoutEffect(() => {
    const element = scroller.current;

    if (element === null) {
      return;
    }

    const memory = keeper?.read();
    following.current = keeper !== null && (memory?.following ?? true);
    scrollTo(element, following.current ? element.scrollHeight : (memory?.top ?? 0));
  }, [scroller, keeper]);

  useEffect(() => {
    const element = scroller.current;

    if (element === null || keeper === null) {
      return undefined;
    }

    const onScroll = (): void => {
      following.current = atEnd(element);
      keeper.write({ top: element.scrollTop, following: following.current });
    };
    const onResize = (): void => {
      if (following.current) {
        scrollTo(element, element.scrollHeight);
      }
    };
    const observer = new ResizeObserver(onResize);

    observer.observe(element);
    if (content.current !== null) {
      observer.observe(content.current);
    }
    element.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', onScroll);
    };
  }, [scroller, content, keeper]);
}

/** Moves a scroller — the one write this hook makes to the page. */
function scrollTo(element: HTMLElement, top: number): void {
  element.scrollTop = top;
}
