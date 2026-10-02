import fs from 'node:fs';

import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { workbenchSuite } from '../fixtures/folder-tree';
import { scrollsSideways } from '../fixtures/page-checks';
import { onWorkbenchOf, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The workbench on a phone, in a real browser — plan 06, F6, B-39 (S-161).
 *
 * The integration suite proves which view is shown; what only a browser that lays pages out can say
 * is the measure: no horizontal scroll at 360 px, and every target at least 44 × 44 px.
 */

const phone = scenario('workbench-phone');
const expected = phone.expect as {
  viewport: { width: number; height: number };
  target: number;
  views: string[];
};

test.use({ viewport: expected.viewport, isMobile: true, hasTouch: true });

const suite = workbenchSuite(phone.user);

/** Asserts a target is big enough for a finger. */
async function expectTouchable(target: Locator): Promise<void> {
  const box = await target.boundingBox();

  expect(box, 'the target is not laid out').not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(expected.target);
  expect(box?.height).toBeGreaterThanOrEqual(expected.target);
}

test(`${phone.id} — ${phone.title}`, async ({ page }) => {
  const folders = suite.tree();
  const gamma = fs.realpathSync(folders.gamma);
  const alpha = fs.realpathSync(folders.alpha);

  for (const folder of [gamma, alpha]) {
    await suite.openTab(folder);
  }

  await openSignedIn(page, phone.user, workbenchAddress(gamma));
  const selector = page.getByRole('button', { name: 'Folder tab: gamma' });
  await expect(selector).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);

  // The tabs are a selector, not a strip.
  await expect(page.getByRole('navigation', { name: 'Open folders' })).toHaveCount(0);
  await expectTouchable(selector);
  await selector.click();
  await page.getByRole('menuitemradio', { name: 'alpha' }).click();
  await page.waitForURL(onWorkbenchOf(alpha));
  await expect(page.getByRole('button', { name: 'Folder tab: alpha' })).toBeVisible();

  // One view at a time, from the bar at the bottom.
  const bar = page.getByRole('navigation', { name: 'Views of this folder' });
  for (const view of expected.views) {
    await expectTouchable(bar.getByRole('button', { name: view }));
  }
  await bar.getByRole('button', { name: 'Claude' }).click();
  await expect(page.getByRole('complementary', { name: 'Claude' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Editor' })).toHaveCount(0);
  await bar.getByRole('button', { name: 'Editor' }).click();
  await expect(page.getByRole('region', { name: 'Editor' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Claude' })).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);

  for (const name of ['Open the menu', 'Open folder…', 'Help for this screen']) {
    await expectTouchable(page.getByRole('button', { name, exact: true }));
  }

  // The navigation is a menu; a screen reached from it does not scroll sideways either.
  await page.getByRole('button', { name: 'Open the menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Global navigation' });
  const rules = menu.getByRole('link', { name: 'Rules' });
  await expectTouchable(rules);
  await rules.click();
  await page.waitForURL((url) => url.pathname === '/rules');
  await expect(page.getByRole('heading', { level: 1, name: 'Your rules' })).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
});
