import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { scenario } from '../scenarios';

/**
 * The screens plan 06 separated — one per subject — through the door a person uses (plan 06, F5).
 *
 * What only the real stack can say: the theme kept by the real browser across a reload, and the
 * versions the running backend reads of itself. The screens' states are proved in the web's
 * integration suite; the workbench is F6's.
 */

const appearance = scenario('screens-appearance');
const about = scenario('screens-about');

test(`${appearance.id} — ${appearance.title}`, async ({ page }) => {
  const expected = appearance.expect as { pick: string; restore: string };
  const html = page.locator('html');

  await openSignedIn(page, appearance.user, '/settings/appearance');
  const theme = page.getByRole('group', { name: 'Theme' });
  await theme.getByRole('radio', { name: expected.pick }).check();

  await expect(html).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: expected.pick }),
  ).toBeChecked();
  await expect(html).toHaveClass(/\bdark\b/);

  // And back to the system's — which, in this browser, asks for light.
  await page.getByRole('button', { name: expected.restore }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
});

test(`${about.id} — ${about.title}`, async ({ page }) => {
  const expected = about.expect as { components: string[]; unreadable: string };

  await openSignedIn(page, about.user, '/rules');
  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('menuitem', { name: 'About' }).click();
  await page.waitForURL('**/about');

  const versions = page.locator('dl');
  for (const component of expected.components) {
    await expect(versions.getByText(component, { exact: true })).toBeVisible();
  }
  // The backend reads its own version and Node's: the two that are always there.
  const backend = versions
    .getByText('Backend', { exact: true })
    .locator('xpath=following-sibling::dd[1]');
  await expect(backend).toHaveText(/^\d+\.\d+\.\d+/);
  const node = versions
    .getByText('Node', { exact: true })
    .locator('xpath=following-sibling::dd[1]');
  await expect(node).not.toHaveText(expected.unreadable);
  await expect(page.getByRole('button', { name: 'Copy versions' })).toBeVisible();
});
