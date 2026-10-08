import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/** Whether the end is followed, and the way back to it — what "N new" needs (plan 22, B-23). */
export interface TailControl {
  /** The end is in view, and what arrives keeps it there. */
  readonly following: boolean;

  /** Goes to the end, and follows it from there. */
  toEnd(): void;
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
): TailControl {
  const following = useRef(false);

  // Whether the end is in view, for the screen to draw — what the ref holds, for the next render. It
  // starts again with each new content, from where that content was left.
  const [tracked, setTracked] = useState(() => ({ keeper, following: startsFollowing(keeper) }));

  if (tracked.keeper !== keeper) {
    setTracked({ keeper, following: startsFollowing(keeper) });
  }

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
      const now = atEnd(element);
      following.current = now;
      setTracked((before) => (before.following === now ? before : { ...before, following: now }));
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

  return {
    following: tracked.following,
    toEnd: () => {
      const element = scroller.current;

      if (element === null || keeper === null) {
        return;
      }

      following.current = true;
      setTracked((before) => ({ ...before, following: true }));
      scrollTo(element, element.scrollHeight);
      keeper.write({ top: element.scrollTop, following: true });
    },
  };
}

/** Whether a content starts at its end: where it was left, or at the end the first time. */
function startsFollowing(keeper: ScrollKeeper | null): boolean {
  return keeper?.read()?.following ?? true;
}

/** Moves a scroller — the one write this hook makes to the page. */
function scrollTo(element: HTMLElement, top: number): void {
  element.scrollTop = top;
}
