import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * What only a browser that lays pages out can judge — the checks the specs of the screens share:
 * axe on the stylesheet that ships, and a page that never scrolls sideways on a phone.
 */

/**
 * What axe finds on the page as it is now, one line per violation and node — empty when none.
 *
 * @param tags the rule sets of the scenario (`wcag2a`, `wcag2aa`…)
 */
export async function violationsOn(page: Page, tags: readonly string[]): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags([...tags]).analyze();

  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id}: ${node.target.join(' ')} — ${node.failureSummary ?? ''}`,
    ),
  );
}

/** Whether the page scrolls sideways — what a phone must never do. */
export function scrollsSideways(page: Page): Promise<boolean> {
  return page.locator('html').evaluate((html) => html.scrollWidth > html.clientWidth);
}

/**
 * What sticks out past the right edge of the page, the outermost of each — tag, accessible name or
 * text, and how far — so a page that scrolls sideways says where, not only that it does.
 */
export function widerThanThePage(page: Page): Promise<string[]> {
  return page.locator('body').evaluate((body) => {
    const view = body.ownerDocument.defaultView;
    const edge = body.ownerDocument.documentElement.clientWidth;
    const every = [...body.querySelectorAll('*')];
    // Clipped by a box of its own that scrolls or hides what overflows, and stays on the page: that
    // box scrolls, never the page.
    const clipped = (element: (typeof every)[number]): boolean => {
      for (let box = element.parentElement; box !== null; box = box.parentElement) {
        const overflow = view?.getComputedStyle(box).overflowX ?? 'visible';
        if (overflow !== 'visible' && box.getBoundingClientRect().right <= edge + 0.5) {
          return true;
        }
      }
      return false;
    };
    const out = every.filter(
      (element) => element.getBoundingClientRect().right > edge + 0.5 && !clipped(element),
    );

    return out
      .filter((element) => !out.includes(element.parentElement ?? body))
      .map((element) => {
        const name = element.getAttribute('aria-label') ?? (element.textContent ?? '').trim();
        const past = Math.round(element.getBoundingClientRect().right - edge);
        return `${element.tagName.toLowerCase()} “${name.slice(0, 60)}” — ${String(past)} px past the edge`;
      });
  });
}
