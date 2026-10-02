import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** How near the end counts as "at the end": a line of slack, so a rounding is not a scroll up. */
const SLACK_PX = 24;

/** The nearest ancestor that scrolls — the side bar, the bottom panel, the phone's screen. */
export function scrollParentOf(node: HTMLElement | null): HTMLElement | null {
  for (let at = node?.parentElement ?? null; at !== null; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);

    if (overflowY === 'auto' || overflowY === 'scroll') {
      return at;
    }
  }

  return null;
}

/** Whether a scrolled element shows its end. */
export function atEnd(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= SLACK_PX;
}

/**
 * Keeps the end of a conversation in view as it grows — **while the person is there**: once they
 * scrolled up to read, what arrives does not pull them down again, and coming back to the end
 * follows once more (plan 08, S-81).
 *
 * @param change what grows — a new value of it is new content to follow
 */
export function useFollowTail(container: RefObject<HTMLElement | null>, change: unknown): void {
  const following = useRef(true);

  useEffect(() => {
    const parent = scrollParentOf(container.current);

    if (parent === null) {
      return undefined;
    }

    const onScroll = (): void => {
      following.current = atEnd(parent);
    };

    parent.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      parent.removeEventListener('scroll', onScroll);
    };
  }, [container]);

  useLayoutEffect(() => {
    const parent = scrollParentOf(container.current);

    if (parent !== null && following.current) {
      parent.scrollTop = parent.scrollHeight;
    }
  }, [container, change]);
}
