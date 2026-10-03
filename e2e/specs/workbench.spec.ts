import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { conversationOf, draftOf, panelOf, send } from '../fixtures/claude-panel';
import { sessionsOpened, tabsOf, workbenchSuite } from '../fixtures/folder-tree';
import { attachFrom, connected } from '../fixtures/live-session';
import {
  folderDialog,
  goDown,
  namesListed,
  onWorkbenchOf,
  openThroughDialog,
  sessionInTab,
  tabOf,
  tabStrip,
  workbenchAddress,
} from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The workbench of plan 06, through the door a person uses — F6, B-35…B-37.
 *
 * What only the whole stack can say: that the path the backend resolved is the one in the address,
 * that a reload restores the tabs the server kept, and that a session started in a tab runs in that
 * tab's folder — the scripted Claude names its own directory, the case the user reported ("it said
 * it was in /tmp/remote-claude-workspaces") turned into a test.
 *
 * Every test works in a tree of folders of its own inside the root, and starts and ends with no tab.
 */

const defaults = scenario('workbench-allowlist-default');
const opening = scenario('workbench-open-folder');
const cwd = scenario('workbench-session-cwd');
const refused = scenario('workbench-not-allowed');
const tabs = scenario('workbench-tabs');
const missing = scenario('workbench-tab-missing');

const suite = workbenchSuite(defaults.user);
const { user, tree, rootLabel, openTab } = suite;
const opened = sessionsOpened(user);

/** The repository, where the allowlists of the stack live. */
const REPOSITORY = path.resolve(import.meta.dirname, '..', '..');

/** The roots an allowlist file declares — read from it, never repeated here. */
function rootsDeclaredIn(file: string): string[] {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line) => /^\s*-\s*path:\s*(\S+)\s*$/.exec(line)?.[1] ?? []);
}

/** Starts a session in the tab on screen and asks the scripted Claude where it is. */
async function askWhereItRuns(page: Page, folder: string, prompt: string): Promise<string> {
  const sessionId = await sessionInTab(page, cwd.user, folder);
  opened(sessionId);
  await send(page, prompt);

  return sessionId;
}

test(`${defaults.id} — ${defaults.title}`, async ({ page }) => {
  const expected = defaults.expect as { defaultAllowlist: string; localAllowlist: string };
  const declared = rootsDeclaredIn(path.join(REPOSITORY, expected.defaultAllowlist));
  const local = path.join(REPOSITORY, expected.localAllowlist);
  const localOnly = fs.existsSync(local)
    ? rootsDeclaredIn(local).filter((root) => !declared.includes(root))
    : [];

  const listed = await suite.roots();
  expect(listed.map((root) => root.path).sort()).toEqual([...declared].sort());
  for (const root of localOnly) {
    expect(listed.map((each) => each.path)).not.toContain(root);
  }

  // And the dialog, which is what a person sees of the allowlist: those roots, and no other.
  await openSignedIn(page, defaults.user, '/');
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await expect
    .poll(() => namesListed(folderDialog(page)))
    .toEqual(listed.map((root) => root.label));
});

test(`${opening.id} — ${opening.title}`, async ({ page }) => {
  const expected = opening.expect as { listed: string[]; hidden: string; path: string[] };
  const folders = tree();
  const real = fs.realpathSync(folders.beta);
  const dialog = folderDialog(page);

  await openSignedIn(page, opening.user, '/');
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await goDown(dialog, [await rootLabel()]);

  // Down to the folder of the test: the link that escapes is not listed, the hidden one only on ask.
  await dialog.getByRole('option', { name: path.basename(folders.base), exact: true }).click();
  await expect.poll(() => namesListed(dialog)).toEqual(expected.listed);
  await dialog.getByRole('checkbox', { name: 'Show hidden folders' }).check();
  await expect(dialog.getByRole('option', { name: expected.hidden, exact: true })).toBeVisible();

  // Through the link that stays inside, and open: the address names the folder the link reaches.
  for (const name of expected.path) {
    await dialog.getByRole('option', { name, exact: true }).click();
  }
  await expect(dialog.getByRole('listbox')).toHaveAccessibleName('Folders in beta');
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForURL(onWorkbenchOf(real));

  await expect(tabOf(page, 'beta')).toHaveAttribute('aria-current', 'page');
  expect(await tabsOf(user())).toEqual([real]);

  await page.reload();
  await page.waitForURL(onWorkbenchOf(real));
  await expect(tabOf(page, 'beta')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: `Copy the path ${real}` })).toBeVisible();
});

test(`${cwd.id} — ${cwd.title}`, async ({ page }) => {
  const expected = cwd.expect as { prompt: string };
  const folders = tree();
  const real = fs.realpathSync(folders.gamma);

  await askWhereItRuns(page, real, expected.prompt);

  await expect(conversationOf(page).getByText(real, { exact: true })).toBeVisible();

  // The explorer, the editor and the chat, side by side in the one tab.
  const explorer = await page.getByRole('complementary', { name: 'Explorer' }).boundingBox();
  const editor = await page.getByRole('region', { name: 'Editor' }).boundingBox();
  const claude = await panelOf(page).boundingBox();
  expect(explorer?.x).toBeLessThan(editor?.x ?? 0);
  expect(editor?.x).toBeLessThan(claude?.x ?? 0);
});

test(`${refused.id} — ${refused.title}`, async ({ page }) => {
  const folders = tree();
  const expected = refused.expect as { code: string; refused: string };

  await openSignedIn(page, refused.user, workbenchAddress(folders.outside));
  const refusal = page.getByRole('region', { name: 'This folder cannot be opened' });
  await expect(refusal.getByText(`${expected.refused} ${folders.outside}.`)).toBeVisible();

  // The link that leaves the root is the same folder by another name, and is refused the same way.
  await page.goto(workbenchAddress(folders.escape));
  await expect(refusal.getByText(new RegExp(`^${expected.refused} `))).toBeVisible();
  expect(await tabsOf(user())).toEqual([]);

  await refusal.getByRole('button', { name: 'Back to the welcome screen' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByRole('button', { name: 'Open folder…' })).toBeVisible();
});

test(`${tabs.id} — ${tabs.title}`, async ({ page }) => {
  const expected = tabs.expect as { prompt: string; sessionsCarryOn: string };
  const folders = tree();
  const gamma = fs.realpathSync(folders.gamma);
  const alpha = fs.realpathSync(folders.alpha);
  const sideBar = page.getByRole('button', { name: 'Show or hide the side bar' });

  // A session in the first tab, answering where it runs.
  const sessionId = await askWhereItRuns(page, gamma, expected.prompt);
  await expect(conversationOf(page).getByText(gamma, { exact: true })).toBeVisible();

  // A second tab, from the workbench's own button, and its side bar hidden.
  await page.getByRole('button', { name: 'Open folder…', exact: true }).click();
  await openThroughDialog(page, await rootLabel(), [path.basename(folders.base), 'alpha']);
  await page.waitForURL(onWorkbenchOf(alpha));
  await sideBar.click();
  await expect(sideBar).toHaveAttribute('aria-pressed', 'false');

  // Back and forth: each tab as it was left.
  await tabOf(page, 'gamma').click();
  await page.waitForURL(onWorkbenchOf(gamma));
  await expect(conversationOf(page).getByText(gamma, { exact: true })).toBeVisible();
  await expect(sideBar).toHaveAttribute('aria-pressed', 'true');
  await tabOf(page, 'alpha').click();
  await page.waitForURL(onWorkbenchOf(alpha));
  await expect(sideBar).toHaveAttribute('aria-pressed', 'false');

  // A new order, and a reload: the same set, in that order, on the same tab.
  await tabOf(page, 'alpha').press('Alt+Shift+ArrowLeft');
  await expect.poll(() => tabsOf(user())).toEqual([alpha, gamma]);
  await page.reload();
  await page.waitForURL(onWorkbenchOf(alpha));
  await expect(tabStrip(page).getByRole('button', { name: /^(alpha|gamma)$/ })).toHaveText([
    'alpha',
    'gamma',
  ]);
  await expect(tabOf(page, 'alpha')).toHaveAttribute('aria-current', 'page');
  await expect(sideBar).toHaveAttribute('aria-pressed', 'false');

  // Closing the other tab says its sessions carry on — and they do; this one is untouched.
  await tabStrip(page).getByRole('button', { name: 'Close gamma' }).click();
  const question = page.getByRole('dialog', { name: 'Close gamma?' });
  await expect(question.getByText(expected.sessionsCarryOn)).toBeVisible();
  await question.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(tabOf(page, 'gamma')).toBeHidden();
  await expect(tabOf(page, 'alpha')).toHaveAttribute('aria-current', 'page');
  await expect(sideBar).toHaveAttribute('aria-pressed', 'false');
  expect(await tabsOf(user())).toEqual([alpha]);

  const socket = await connected(user());
  try {
    await expect(attachFrom(socket, sessionId, 0)).resolves.toMatchObject({ gap: false });
  } finally {
    socket.close();
  }
});

test(`${missing.id} — ${missing.title}`, async ({ page }) => {
  const expected = missing.expect as { code: string; marked: string };
  const folders = tree();
  const doomed = fs.realpathSync(folders.doomed);
  const gamma = fs.realpathSync(folders.gamma);

  await openTab(doomed);
  await openTab(gamma);
  await openSignedIn(page, missing.user, workbenchAddress(gamma));
  await expect(tabOf(page, 'doomed')).toBeVisible();

  fs.rmSync(doomed, { recursive: true });

  await tabOf(page, 'doomed').click();
  await page.waitForURL(onWorkbenchOf(doomed));
  const refusal = page.getByRole('region', { name: 'This folder cannot be opened' });
  await expect(refusal.getByText(`${doomed} does not exist.`)).toBeVisible();

  // The other tab carries on, and the tabs read again mark the one that left the disk.
  await tabOf(page, 'gamma').click();
  await page.waitForURL(onWorkbenchOf(gamma));
  await expect(draftOf(page)).toBeVisible();
  await page.reload();
  await expect(tabOf(page, 'doomed')).toHaveAccessibleName(`doomed ${expected.marked}`);
  expect(await tabsOf(user())).toEqual([doomed, gamma]);
});
