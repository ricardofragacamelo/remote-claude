/**
 * Where the card of a request is on screen, and the way to it (plan 09, B-25). The card is marked
 * with its request (`data-permission-request`), the frame of the conversation with
 * `data-chat-frame` and its one scroller with `data-chat-scroller` — the DOM is what knows what is
 * in view.
 */

/** The card of a request, wherever it is drawn — a request id is unique on the page. */
export function cardOf(requestId: string, within: ParentNode = document): HTMLElement | null {
  return within.querySelector<HTMLElement>(`[data-permission-request="${CSS.escape(requestId)}"]`);
}

/** The scroller of the frame `anchor` is in, or `null` outside a frame. */
export function scrollerOf(anchor: Element | null): HTMLElement | null {
  return (
    anchor?.closest('[data-chat-frame]')?.querySelector<HTMLElement>('[data-chat-scroller]') ?? null
  );
}

/**
 * Whether the card of any of these requests is out of view: scrolled away, or not drawn at all —
 * the changes on screen instead of the conversation. A card partly in view is in view.
 */
export function anyOutOfView(scroller: HTMLElement | null, requestIds: readonly string[]): boolean {
  if (scroller === null) {
    return requestIds.length > 0;
  }

  const view = scroller.getBoundingClientRect();

  return requestIds.some((requestId) => {
    const card = cardOf(requestId, scroller);
    const box = card?.getBoundingClientRect();

    return box === undefined || box.bottom < view.top || box.top > view.bottom;
  });
}

/**
 * Takes the person to the card of a request: scrolled into view and focused — once it is drawn, the
 * frame after whatever put the conversation back on screen.
 */
export function goToCard(requestId: string): void {
  requestAnimationFrame(() => {
    const card = cardOf(requestId);
    card?.scrollIntoView({ block: 'nearest' });
    card?.focus({ preventScroll: true });
  });
}
