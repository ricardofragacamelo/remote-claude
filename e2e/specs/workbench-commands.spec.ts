import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { workbenchSuite } from '../fixtures/folder-tree';
import {
  folderDialog,
  onWorkbenchOf,
  openThroughDialog,
  tabOf,
  workbenchAddress,
} from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The commands of the workbench and the notifications, through the door a person uses — plan 06,
 * F6, B-38.
 *
 * A folder opens from the **File** menu and from the palette, the same command both ways; and the
 * one refusal this phase tells as a notification — a folder with an open tab that stopped being
 * allowed (06 · D-30) — pops up as a toast and stays in the centre, which the server keeps.
 *
 * How a folder stops being allowed without touching the allowlist of the stack: it is replaced on
 * the disk by a symbolic link that leaves the root. The path the tab holds is the same; what it
 * leads to is not, and the backend, which resolves every link, refuses it.
 */

const commands = scenario('workbench-commands');

const suite = workbenchSuite(commands.user);

test(`${commands.id} — ${commands.title}`, async ({ page }) => {
  const expected = commands.expect as { command: string; notice: string };
  const folders = suite.tree();
  const doomed = fs.realpathSync(folders.doomed);
  const alpha = fs.realpathSync(folders.alpha);
  const beta = fs.realpathSync(folders.beta);
  const rootLabel = await suite.rootLabel();

  await suite.openTab(doomed);
  await openSignedIn(page, commands.user, workbenchAddress(fs.realpathSync(folders.gamma)));
  await expect(tabOf(page, 'doomed')).toBeVisible();

  // The folder of the first tab leaves the allowlist, with its tab open.
  fs.rmSync(doomed, { recursive: true });
  fs.symlinkSync(folders.outside, doomed);

  // File → Open folder…
  await page.getByRole('menubar', { name: 'Application menu' }).getByText('File').click();
  await page.getByRole('menuitem', { name: expected.command }).click();
  await openThroughDialog(page, rootLabel, [path.basename(folders.base), 'alpha']);
  await page.waitForURL(onWorkbenchOf(alpha));

  // Opening it read the tabs again, and the one that stopped being allowed is told about.
  const notice = `${doomed} ${expected.notice}`;
  await expect(page.getByRole('status').filter({ hasText: notice })).toBeVisible();
  await expect(tabOf(page, 'doomed')).toHaveAccessibleName('doomed No longer allowed');

  await page.getByRole('button', { name: /^Notifications: \d+ unread$/ }).click();
  const centre = page.getByRole('dialog', { name: 'Notifications' });
  await expect(
    centre.getByRole('list', { name: 'Notifications, newest first' }).getByText(notice),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(centre).toBeHidden();

  // The palette: the same command, found by its name.
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox').fill(`>${expected.command.replace('…', '')}`);
  await palette.getByRole('option', { name: expected.command }).click();
  await expect(folderDialog(page)).toBeVisible();
  await openThroughDialog(page, rootLabel, [path.basename(folders.base), 'alpha', 'beta']);
  await page.waitForURL(onWorkbenchOf(beta));
  await expect(tabOf(page, 'beta')).toHaveAttribute('aria-current', 'page');
});
