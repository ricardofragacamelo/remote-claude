import fs from 'node:fs';

import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import {
  allowOnce,
  draftOf,
  endSession,
  inlineCardFor,
  interruptButton,
  send,
  turnSummaries,
  workingIndicator,
} from '../fixtures/claude-panel';
import { workbenchSuite } from '../fixtures/folder-tree';
import { violationsOn } from '../fixtures/page-checks';
import { folderDialog, openFromDraft, workbenchAddress } from '../fixtures/workbench';
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

/** The panel of Claude in the states plan 09 drew (S-84), and the turns that lead to each. */
const panel = scenario('chat-layout').expect as {
  inlineTurn: string;
  inlineTool: string;
  heldTurn: string;
};

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
    expect(await violationsOn(page, expected.tags), 'the welcome screen').toEqual([]);

    await open.click();
    await expect(folderDialog(page).getByRole('option').first()).toBeVisible();
    expect(await violationsOn(page, expected.tags), 'the open-folder dialog').toEqual([]);
    await page.keyboard.press('Escape');

    await page.goto(workbenchAddress(folder));
    await expect(draftOf(page)).toBeVisible();
    expect(await violationsOn(page, expected.tags), 'the workbench').toEqual([]);

    for (const screen of expected.screens) {
      await page.goto(screen.path);
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
      await expect(page.getByRole('status', { name: /^(Loading|Looking)/ })).toHaveCount(0);
      expect(await violationsOn(page, expected.tags), screen.path).toEqual([]);
    }
  });
}

for (const theme of expected.themes) {
  test(`09·S-84 — axe finds no violation in the panel of Claude as a draft, with a turn running, asking, and ended (${theme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const folder = fs.realpathSync(suite.tree().gamma);
    await suite.openTab(folder);
    await openSignedIn(page, axe.user, workbenchAddress(folder));

    await expect(draftOf(page)).toBeVisible();
    expect(await violationsOn(page, expected.tags), 'the panel, a draft').toEqual([]);

    // Ended by the test itself, from its menu — the last state it checks.
    await openFromDraft(page);
    const turns = turnSummaries(page);

    await send(page, `hold on [fixture:${panel.heldTurn}] [hold]`);
    await expect(workingIndicator(page)).toBeVisible();
    expect(await violationsOn(page, expected.tags), 'the panel, a turn running').toEqual([]);
    const held = await turns.count();
    await interruptButton(page).click();
    await expect(turns).toHaveCount(held + 1);

    await send(page, `do the work [fixture:${panel.inlineTurn}]`);
    const card = inlineCardFor(page, panel.inlineTool);
    await expect(card).toBeVisible();
    expect(await violationsOn(page, expected.tags), 'the panel, asking').toEqual([]);
    const asked = await turns.count();
    await allowOnce(card).click();
    await expect(turns).toHaveCount(asked + 1);

    await endSession(page);
    await expect(page.getByText(/^This session ended/)).toBeVisible();
    expect(await violationsOn(page, expected.tags), 'the panel, ended').toEqual([]);
  });
}
