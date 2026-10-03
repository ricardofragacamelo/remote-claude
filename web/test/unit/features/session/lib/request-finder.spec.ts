import { afterEach, describe, expect, it, vi } from 'vitest';

import { anyOutOfView, cardOf, goToCard, scrollerOf } from '@/features/session/lib/request-finder';

/** A rectangle, as `getBoundingClientRect` answers it — only the edges that matter here. */
function box(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    x: 0,
    y: top,
  } as DOMRect;
}

/** A frame with a scroller from 100 to 400 px, holding the cards of `requests` at the edges given. */
function frameWith(requests: Readonly<Record<string, readonly [number, number]>>): {
  readonly scroller: HTMLElement;
  readonly dock: HTMLElement;
} {
  const frame = document.createElement('section');
  frame.setAttribute('data-chat-frame', '');
  const scroller = document.createElement('div');
  scroller.setAttribute('data-chat-scroller', '');
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(box(100, 400));

  for (const [requestId, [top, bottom]] of Object.entries(requests)) {
    const card = document.createElement('li');
    card.setAttribute('data-permission-request', requestId);
    card.tabIndex = -1;
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(box(top, bottom));
    scroller.append(card);
  }

  const dock = document.createElement('div');
  frame.append(scroller, dock);
  document.body.append(frame);
  return { scroller, dock };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** Where a request's card is on screen — plan 09, B-25. */
describe('the card of a request, on screen', () => {
  it('finds the scroller of the frame from anywhere in it, and nothing outside a frame', () => {
    const { scroller, dock } = frameWith({});

    expect(scrollerOf(dock)).toBe(scroller);
    expect(scrollerOf(document.createElement('div'))).toBeNull();
    expect(scrollerOf(null)).toBeNull();
  });

  it('finds a card by its request, even one whose id needs escaping', () => {
    frameWith({ 'req "1"': [120, 200] });

    expect(cardOf('req "1"')).not.toBeNull();
    expect(cardOf('req-2')).toBeNull();
  });

  it('is in view whole, or in part — at either edge', () => {
    const { scroller } = frameWith({ whole: [150, 300], top: [50, 120], bottom: [380, 600] });

    expect(anyOutOfView(scroller, ['whole', 'top', 'bottom'])).toBe(false);
  });

  it('is out of view scrolled above or below — S-67', () => {
    const { scroller } = frameWith({ above: [-300, 99], below: [401, 700], seen: [150, 200] });

    expect(anyOutOfView(scroller, ['above'])).toBe(true);
    expect(anyOutOfView(scroller, ['below'])).toBe(true);
    expect(anyOutOfView(scroller, ['seen', 'above'])).toBe(true);
  });

  it('is out of view when it is not drawn — the changes on screen — S-68', () => {
    const { scroller } = frameWith({});

    expect(anyOutOfView(scroller, ['req-1'])).toBe(true);
    expect(anyOutOfView(null, ['req-1'])).toBe(true);
  });

  it('has nothing out of view with nothing asked', () => {
    const { scroller } = frameWith({});

    expect(anyOutOfView(scroller, [])).toBe(false);
    expect(anyOutOfView(null, [])).toBe(false);
  });

  it('takes the person to the card: scrolled into view and focused, once it is drawn', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => {
      run(0);
      return 0;
    });
    frameWith({ 'req-1': [500, 700] });
    const card = cardOf('req-1');
    const scrolled = vi.spyOn(card as HTMLElement, 'scrollIntoView');

    goToCard('req-1');

    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
    expect(document.activeElement).toBe(card);
  });

  it('does nothing for a card that is not there', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => {
      run(0);
      return 0;
    });

    expect(() => {
      goToCard('gone');
    }).not.toThrow();
  });
});
