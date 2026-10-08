import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import {
  allowOnce,
  decisionLine,
  inlineCardFor,
  modeChip,
  panelOf,
  send,
  turnSummaries,
} from '../fixtures/claude-panel';
import { folderWith } from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { openFromDraft, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * Plan 23 through the browser: the two things the user asked for — fewer questions, and a switch
 * that stops them and starts them again.
 *
 * The recorded turn asks about one `Write`. Permitir tudo answers it in the person's name, with no
 * card, and says so on its line; switched off, the next one asks. A yes for the session whose reach
 * is the whole tool answers the next write by itself. The reaches of a shell line, and the line of
 * several commands, are proved against the real database in the integration suite (S-57).
 */

const allowAll = scenario('mobile-fluid-allow-all');
const reach = scenario('mobile-fluid-rule-reach');
const modes = allowAll.expect as {
  fixture: string;
  tool: string;
  modeLabel: string;
  allowAll: string;
  ask: string;
  allowedByMode: string;
};
const reaches = reach.expect as {
  fixture: string;
  tool: string;
  reachTool: string;
  pattern: string;
  session: string;
  allowedByRule: string;
};

const suite = workbenchSuite(allowAll.user);
const opened = sessionsOpened(suite.user);

/** A session opened from the draft of a folder tab of this test: how many turns of it ended. */
async function aSession(page: Page): Promise<number> {
  const folder = folderWith(suite.tree().gamma, { 'notes.md': 'Two goals: safe, and fast.\n' });
  await suite.openTab(folder);
  await openSignedIn(page, allowAll.user, workbenchAddress(folder));
  opened(await openFromDraft(page));

  return turnSummaries(page).count();
}

/** Picks `mode` in the menu of the mode chip. */
async function switchTo(page: Page, mode: string): Promise<void> {
  await modeChip(page).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${mode}`) }).click();
  await expect(modeChip(page, mode)).toBeVisible();
}

test(`${allowAll.id} — ${allowAll.title}`, async ({ page }) => {
  const before = await aSession(page);

  await switchTo(page, modes.allowAll);
  await send(page, `do the work [fixture:${modes.fixture}]`);

  await expect(turnSummaries(page)).toHaveCount(before + 1);
  await expect(decisionLine(page, modes.allowedByMode)).toBeVisible();
  await expect(inlineCardFor(page, modes.tool)).toHaveCount(0);

  await switchTo(page, modes.ask);
  await send(page, `do it again [fixture:${modes.fixture}]`);

  const card = inlineCardFor(page, modes.tool);
  await expect(card).toBeVisible();
  await allowOnce(card).click();
  await expect(turnSummaries(page)).toHaveCount(before + 2);
});

test(`${reach.id} — ${reach.title}`, async ({ page }) => {
  const before = await aSession(page);

  await send(page, `do the work [fixture:${reaches.fixture}]`);
  const card = inlineCardFor(page, reaches.tool);
  await expect(card).toBeVisible();

  // The whole tool is said in full — its pattern — before anybody chooses it.
  const wider = card.getByRole('radio', { name: new RegExp(reaches.reachTool) });
  await wider.check();
  await expect(card.getByText(reaches.pattern, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: reaches.session }).click();
  await expect(turnSummaries(page)).toHaveCount(before + 1);

  await send(page, `do it again [fixture:${reaches.fixture}]`);
  await expect(turnSummaries(page)).toHaveCount(before + 2);
  await expect(inlineCardFor(page, reaches.tool)).toHaveCount(0);
  await expect(panelOf(page).getByText(reaches.allowedByRule).last()).toBeVisible();
});
