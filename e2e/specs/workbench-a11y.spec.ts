import fs from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { workbenchSuite } from '../fixtures/folder-tree';
import { folderDialog, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * Accessibility of every screen plan 06 drew, in a real browser — F6, B-39 (S-162).
 *
 * The integration suite runs axe on each component in jsdom, which has no layout and no colours:
 * contrast, and anything else that depends on the stylesheet actually applied, can only be judged
 * here. Both themes, because the tokens are two sets of colours and either may fail on its own; the
 * theme is the system's, the default preference, so the browser's colour scheme picks it.
 */

const axe = scenario('workbench-axe');
const expected = axe.expect as {
  themes: ('light' | 'dark')[];
  tags: string[];
  screens: { path: string; heading: string }[];
};

const suite = workbenchSuite(axe.user);

/** What axe finds on the page as it is now, one line per violation and node — empty when none. */
async function violationsOn(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(expected.tags).analyze();

  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id}: ${node.target.join(' ')} — ${node.failureSummary ?? ''}`,
    ),
  );
}

for (const theme of expected.themes) {
  test(`${axe.id} — ${axe.title} (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const html = page.locator('html');
    const folder = fs.realpathSync(suite.tree().gamma);

    await openSignedIn(page, axe.user, '/');
    if (theme === 'dark') {
      await expect(html).toHaveClass(/\bdark\b/);
    } else {
      await expect(html).not.toHaveClass(/\bdark\b/);
    }
    const open = page.getByRole('button', { name: 'Open folder…' });
    await expect(open).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Allowed folders' })).toBeVisible();
    expect(await violationsOn(page), 'the welcome screen').toEqual([]);

    await open.click();
    await expect(folderDialog(page).getByRole('option').first()).toBeVisible();
    expect(await violationsOn(page), 'the open-folder dialog').toEqual([]);
    await page.keyboard.press('Escape');

    await page.goto(workbenchAddress(folder));
    await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible();
    expect(await violationsOn(page), 'the workbench').toEqual([]);

    for (const screen of expected.screens) {
      await page.goto(screen.path);
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
      await expect(page.getByRole('status', { name: /^(Loading|Looking)/ })).toHaveCount(0);
      expect(await violationsOn(page), screen.path).toEqual([]);
    }
  });
}
