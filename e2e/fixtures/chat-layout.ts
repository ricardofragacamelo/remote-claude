import type { Locator, Page } from '@playwright/test';

/**
 * What only a browser that lays the panel out can measure (plan 09, F1): what scrolls, and whether
 * the box is where a person can reach it.
 */

/** Whether the document itself scrolls down — what the frame of the app must never do. */
export function documentScrolls(page: Page): Promise<boolean> {
  return page.locator('html').evaluate((html) => html.scrollHeight > html.clientHeight + 0.5);
}

/** Whether an element has more inside than it shows, down or sideways. */
export function overflows(target: Locator, axis: 'down' | 'sideways'): Promise<boolean> {
  return target.evaluate(
    (element, sideways) =>
      sideways
        ? element.scrollWidth > element.clientWidth + 0.5
        : element.scrollHeight > element.clientHeight + 0.5,
    axis === 'sideways',
  );
}

/**
 * Whether the whole of an element is inside what the person sees — the visual viewport, which is
 * what is left above the keyboard of a phone — and, when given, above another element (the bar of
 * the views).
 */
export async function wholeInView(target: Locator, above?: Locator): Promise<boolean> {
  const box = await target.boundingBox();
  const limit = await target.evaluate((element) => {
    const view = element.ownerDocument.defaultView;
    return view?.visualViewport?.height ?? view?.innerHeight ?? 0;
  });
  const ceiling = above === undefined ? limit : ((await above.boundingBox())?.y ?? limit);

  return box !== null && box.y >= 0 && box.y + box.height <= Math.min(limit, ceiling) + 0.5;
}

/** Scrolls a scroller to a place — `top`, `end`, or a number of pixels from the top. */
export async function scrollTo(target: Locator, to: 'top' | 'end' | number): Promise<void> {
  await target.evaluate((element, where) => {
    element.scrollTop =
      where === 'top' ? 0 : where === 'end' ? element.scrollHeight : Number(where);
    element.dispatchEvent(new Event('scroll'));
  }, to);
}

/** Where a scroller is, from the top. */
export function scrollTopOf(target: Locator): Promise<number> {
  return target.evaluate((element) => element.scrollTop);
}
