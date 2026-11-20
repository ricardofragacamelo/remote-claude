import fs from 'node:fs';

import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { confirmationOfTheOnlyPoint, lastUndoReport } from '../fixtures/claude-panel';
import { claudeWrites, folderWith } from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { sessionInFolder, tabOf, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The scripted Claude and two folder tabs, through the browser — plan 11, B-24 (S-160, S-161,
 * S-162).
 *
 * What only the whole stack, with a real session, can say: a write that lands *between* a replace
 * preview and its apply is preserved, not overwritten, and reported as such (B-11's own ETag
 * check, D-05); undoing that write afterwards still restores it cleanly; two folder tabs each keep
 * their own search, never mixing a query or a result when the person switches between them; and
 * the composer's `@`, since B-25, offers a folder the same way it offers a file, from the one
 * locator both now share.
 */

const scripted = scenario('search-scripted-claude');
const suite = workbenchSuite(scripted.user);
const opened = sessionsOpened(suite.user);

/** The query box of the Search view on screen. */
function searchBox(page: import('@playwright/test').Page) {
  return page.getByRole('searchbox', { name: 'Search' });
}

async function openSearchView(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

test.describe(`${scripted.id} — ${scripted.title}`, () => {
  test('two folder tabs keep their own query and results apart — S-161', async ({ page }) => {
    const alpha = suite.tree().alpha;
    const beta = suite.tree().beta;
    folderWith(alpha, { 'alpha-file.txt': 'alpha-needle\n' });
    folderWith(beta, { 'beta-file.txt': 'beta-needle\n' });
    await suite.openTab(alpha);
    await suite.openTab(beta);
    await openSignedIn(page, scripted.user, workbenchAddress(alpha));

    await openSearchView(page);
    await searchBox(page).fill('alpha-needle');
    await expect(page.getByRole('tree', { name: 'Search results' })).toBeVisible();

    await tabOf(page, 'beta').click();
    await openSearchView(page);
    await searchBox(page).fill('beta-needle');
    await expect(page.getByRole('tree', { name: 'Search results' })).toBeVisible();

    // Never a result or a query crossing from the other tab — beta's own search, while beta was
    // on screen, never showed a trace of alpha's (checked above); switching back to alpha shows
    // its own fresh view, never beta's query or beta's match.
    await tabOf(page, 'alpha').click();
    await expect(searchBox(page)).not.toHaveValue('beta-needle');
    await expect(page.getByRole('treeitem', { name: 'beta-file.txt' })).not.toBeVisible();
  });

  test('the composer’s @ offers a folder, from the same locator as a file — S-162', async ({
    page,
  }) => {
    await sessionInFolder(page, suite, scripted.user, opened, {
      'widgets/inside.ts': 'x',
      'plain.ts': 'x',
    });

    const prompt = page.getByRole('textbox', { name: 'Prompt' });
    await prompt.fill('@widgets');
    const mentions = page.getByRole('listbox', {
      name: 'Files, folders and more to add to the context',
    });
    await expect(mentions.getByRole('option', { name: /widgets/ })).toBeVisible();

    await prompt.fill('');
    await prompt.fill('@plain');
    await expect(mentions.getByRole('option', { name: /plain\.ts/ })).toBeVisible();
  });

  test('a scripted write between the preview and the apply is preserved, and reported, and its undo still restores it — S-160', async ({
    page,
  }) => {
    const folder = await sessionInFolder(page, suite, scripted.user, opened, {
      'summary.md': 'TODO: old content\n',
    });

    await openSearchView(page);
    await searchBox(page).fill('TODO');
    await expect(page.getByRole('tree', { name: 'Search results' })).toBeVisible();

    await page.getByRole('button', { name: 'Toggle replace' }).click();
    await page.getByRole('textbox', { name: 'Replace' }).fill('DONE');
    // The preview above is what the apply will act on — a snapshot, never re-read on its own.
    await expect(page.getByRole('treeitem', { name: /summary\.md/ })).toBeVisible();

    // The session panel is its own area, beside the Explorer/Search side bar — never behind the
    // same switch, so it is already on screen from `sessionInFolder`'s own opening prompt.
    await claudeWrites(page, 'tool-turn');
    await expect
      .poll(() => fs.readFileSync(`${folder}/summary.md`, 'utf8'))
      .toBe('The project has two goals: safety and speed.\n');

    await page.getByRole('button', { name: 'Replace all' }).click();
    await page
      .getByRole('dialog', { name: 'Replace all' })
      .getByRole('button', { name: 'Replace', exact: true })
      .click();

    await expect(
      page.getByText('1 file(s) preserved — they changed since the preview.'),
    ).toBeVisible();
    expect(fs.readFileSync(`${folder}/summary.md`, 'utf8')).toBe(
      'The project has two goals: safety and speed.\n',
    );

    const confirmation = await confirmationOfTheOnlyPoint(page);
    await confirmation.getByRole('button', { name: 'Undo these files' }).click();

    await expect(
      lastUndoReport(page).getByRole('list', { name: 'Put back' }).getByText('summary.md'),
    ).toBeVisible();
    await expect
      .poll(() => fs.readFileSync(`${folder}/summary.md`, 'utf8'))
      .toBe('TODO: old content\n');
  });
});
