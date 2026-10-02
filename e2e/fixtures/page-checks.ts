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
