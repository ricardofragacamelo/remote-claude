import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import { claimArrival } from '../store/permission.store';

/** Whether the focus is where somebody writes: a field, or an editor. */
function isWriting(element: Element | null): boolean {
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLInputElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/**
 * The focus a card takes when it arrives — **unless somebody is writing** (plan 09, D-13): with the
 * focus in the prompt box, or in the editor, it stays there, and an Enter meant for the prompt never
 * answers the request. Only on arrival: a card drawn again leaves the focus where it is.
 *
 * Where the focus goes is the card's: the refusal of a request that leans to no, the first option of
 * a question (plan 24, B-14).
 *
 * @param lean whether the card takes the focus at all
 */
export function useArrivalFocus<T extends HTMLElement>(
  requestId: string,
  lean: boolean,
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (claimArrival(requestId) && lean && !isWriting(document.activeElement)) {
      ref.current?.focus();
    }
  }, [requestId, lean]);

  return ref;
}
