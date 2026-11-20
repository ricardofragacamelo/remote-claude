import fs from 'node:fs';

import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { fileFact, folderWith, monacoShows } from '../fixtures/explorer';
import { workbenchSuite } from '../fixtures/folder-tree';
import { scrollsSideways, violationsOn, widerThanThePage } from '../fixtures/page-checks';
import { workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The Search view and Quick Open, through the browser — plan 11, B-23 (S-155, S-159 so far).
 *
 * What only a real browser can say: `Ctrl/Cmd+P` actually opens the file Enter picks, at the line
 * `file:42` names; a phone never scrolls sideways; axe on the stylesheet that ships.
 */

const web = scenario('search-web');
const expected = web.expect as { phone: { width: number; height: number } };

const suite = workbenchSuite(web.user);

/** The command palette, open or not — Quick Open and the command mode share the one dialog. */
function paletteOf(page: import('@playwright/test').Page) {
  return page.getByRole('dialog', { name: 'Command palette' });
}

/** A folder tab, open and signed in, with `files` already on disk — every test's own starting point. */
async function openFolderWith(
  page: import('@playwright/test').Page,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const base = suite.tree().alpha;
  folderWith(base, files);
  await suite.openTab(base);
  await openSignedIn(page, web.user, workbenchAddress(base));
  return base;
}

/**
 * Opens Quick Open through the "Go to file…" command, never its own `Ctrl/Cmd+P` directly:
 * Chromium keeps that chord for its own print dialog and never dispatches it to the page at all
 * (the same class of browser-reserved chord `chords.ts`'s own `RESERVED` already names for
 * `Ctrl+N`/`Ctrl+T`/`Ctrl+W` — measured here to be true of `Ctrl+P` too, just not yet in that
 * list). `Ctrl+Shift+P` opens the palette in command mode — proven already, `workbench-commands.spec.ts`
 * — and picking the command by name is the same door a person without that one key gets.
 */
async function openQuickOpen(page: import('@playwright/test').Page): Promise<void> {
  // Mounted once, by the frame (`CommandHost.tsx`) — but only once the app has actually hydrated;
  // a press sent before then reaches no listener at all. The folder tab itself, never a view of
  // the side bar, since a phone may not show the same one a desktop does — and names it
  // differently too ("Folder tab: alpha" there, plain "alpha" on a desktop).
  await expect(page.getByRole('button', { name: /^(Folder tab: )?alpha$/ })).toBeVisible();
  await page.keyboard.press('Control+Shift+P');
  const palette = paletteOf(page);
  await palette.getByRole('combobox').fill('>Go to file');
  await palette.getByRole('option', { name: 'Go to file…' }).click();
}

/** Switches from the Explorer to the Search view, on a desktop viewport. */
async function openSearchView(page: import('@playwright/test').Page): Promise<void> {
  // `exact`: "Search only in open editors" (the toolbar's own toggle) also contains "Search".
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

/** Types `query` into the Search view's own box, and waits for the results tree. */
async function searchFor(page: import('@playwright/test').Page, query: string): Promise<void> {
  await page.getByRole('searchbox', { name: 'Search' }).fill(query);
  await expect(page.getByRole('tree', { name: 'Search results' })).toBeVisible();
}

test.describe(`${web.id} — ${web.title}`, () => {
  test('Ctrl/Cmd+P, a query and Enter open the file in the editor', async ({ page }) => {
    await openFolderWith(page, { 'quick-open-target.ts': 'export const x = 1;\n' });

    await openQuickOpen(page);
    const palette = paletteOf(page);
    await expect(palette).toBeVisible();
    await palette.getByRole('combobox').fill('quick-open-target.ts');
    await expect(palette.getByRole('option', { name: /quick-open-target\.ts/ })).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(palette).toBeHidden();
    await monacoShows(page, 'quick-open-target.ts', 'export const x');
  });

  test('`file:line` opens the file at that line', async ({ page }) => {
    const lines = Array.from({ length: 5 }, (_, index) => `line ${String(index + 1)}`);
    await openFolderWith(page, { 'go-to-line.txt': `${lines.join('\n')}\n` });

    await openQuickOpen(page);
    await paletteOf(page).getByRole('combobox').fill('go-to-line.txt:3');
    await page.keyboard.press('Enter');

    await monacoShows(page, 'go-to-line.txt', 'line 3');
    await expect(page.getByRole('button', { name: 'Ln 3, Col 1 — go to line' })).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ isMobile: true, hasTouch: true, viewport: expected.phone });

    test('Quick Open and the Search view fill the screen without a sideways scroll', async ({
      page,
    }) => {
      await openFolderWith(page, { 'a.ts': 'TODO\n' });

      await openQuickOpen(page);
      await expect(paletteOf(page)).toBeVisible();
      expect(await scrollsSideways(page)).toBe(false);
      await page.keyboard.press('Escape');

      // On a phone, the side bar (Explorer, Search, Claude Code sessions) is behind its own
      // bottom-bar tab (06 · D-08) — "Explorer" in name, but it is the same `ActivityBar` that
      // switches to Search underneath.
      await page
        .getByRole('navigation', { name: 'Views of this folder' })
        .getByText('Explorer')
        .click();
      await page.getByRole('button', { name: 'Search' }).click();
      // The tree itself only mounts once there is something to show — the empty state before a
      // query is a paragraph, not a `role="tree"`.
      await searchFor(page, 'TODO');
      expect(await scrollsSideways(page), (await widerThanThePage(page)).join('\n')).toBe(false);
    });
  });

  test('axe finds nothing on Quick Open and the Search view', async ({ page }) => {
    await openFolderWith(page, { 'a.ts': 'TODO\n' });

    const palette = paletteOf(page);
    await openQuickOpen(page);
    await expect(palette).toBeVisible();
    // A query with at least one real result: the listbox with nothing in it yet is mid-transition,
    // not the shape axe should judge.
    await palette.getByRole('combobox').fill('a.ts');
    await expect(palette.getByRole('option', { name: /a\.ts/ })).toBeVisible();
    expect(await violationsOn(page, ['wcag2a', 'wcag2aa'])).toEqual([]);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Search' }).click();
    await searchFor(page, 'TODO');
    expect(await violationsOn(page, ['wcag2a', 'wcag2aa'])).toEqual([]);
  });

  test('replace all writes to disk, and the write appears in the audit trail — S-156', async ({
    page,
  }) => {
    // A name of its own: the audit trail is the caller's whole history, not this folder's — another
    // spec's own `notes.txt`, saved earlier in the same run under the same `dev` user, would also
    // match `fileFact`'s loose pattern and turn one expected row into a strict-mode violation
    // (measured: `explorer-editor.spec.ts` and `claude-panel-changes.spec.ts` both save one too).
    const base = await openFolderWith(page, {
      'search-replace-notes.txt': 'TODO: fix\nTODO: done\n',
    });
    await openSearchView(page);
    await searchFor(page, 'TODO');

    await page.getByRole('button', { name: 'Toggle replace' }).click();
    await page.getByRole('textbox', { name: 'Replace' }).fill('DONE');
    await page.getByRole('button', { name: 'Replace all' }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Replace all' });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Replace', exact: true }).click();

    // One file, two matches inside it — the report counts files, not matches.
    await expect(page.getByText('1 file(s) replaced.')).toBeVisible();
    await expect
      .poll(() => fs.readFileSync(`${base}/search-replace-notes.txt`, 'utf8'))
      .toBe('DONE: fix\nDONE: done\n');

    await page.goto('/audit');
    // A generous timeout: the audit trail is written synchronously by the apply itself, but a
    // heavily loaded run (the whole e2e suite, not this file alone) can still make the page's own
    // first fetch of it land slower than the default window.
    await expect(fileFact(page, 'Saved', 'search-replace-notes.txt')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('the query survives a reload, and the history answers the arrows — S-158', async ({
    page,
  }) => {
    await openFolderWith(page, { 'alpha.txt': 'alpha-match\n', 'beta.txt': 'beta-match\n' });
    await openSearchView(page);
    const box = page.getByRole('searchbox', { name: 'Search' });

    await box.fill('alpha-match');
    await box.press('Enter');
    await expect(page).toHaveURL(/q=alpha-match/);

    // The side bar's own last-open view is kept across a reload (plan 06) — Search is already
    // showing; clicking its already-pressed button again would only close it.
    await page.reload();
    await expect(box).toHaveValue('alpha-match');
    await expect(page.getByRole('tree', { name: 'Search results' })).toBeVisible();

    await box.fill('beta-match');
    await box.press('Enter');
    await expect(box).toHaveValue('beta-match');

    await box.press('ArrowUp');
    await box.press('ArrowUp');
    await expect(box).toHaveValue('alpha-match');

    await box.press('ArrowDown');
    await expect(box).toHaveValue('beta-match');
  });

  test('the results editor reopens with its own query, after it is closed — S-157', async ({
    page,
  }) => {
    await openFolderWith(page, { 'notes.txt': 'TODO: fix\nTODO: done\n' });
    await openSearchView(page);
    await searchFor(page, 'TODO');
    await page.getByRole('button', { name: 'Open in editor' }).click();

    // `.code-search` is named `search-results-<time>-<random>` (`open-results-editor.ts`) — never
    // known ahead of the click, so the close button is found by its own prefix.
    const closeButton = page.locator('button[aria-label^="Close search-results-"]');
    await expect(closeButton).toBeVisible();
    const closeLabel = (await closeButton.getAttribute('aria-label')) ?? '';
    const fileName = closeLabel.replace(/^Close /, '');

    await expect(page.getByText('Query: TODO', { exact: true })).toBeVisible();
    await closeButton.click();
    await expect(closeButton).toBeHidden();

    // Never through Quick Open: a `.code-search` file is excluded from the locator by the same
    // default that keeps Search from finding its own saved results (D-03) — reopened through the
    // Explorer instead, which lists everything.
    await page.getByRole('button', { name: 'Explorer', exact: true }).click();
    await page.getByRole('treeitem', { name: fileName, exact: true }).dblclick();

    await expect(page.getByText('Query: TODO', { exact: true })).toBeVisible();
  });

  test('help opens, translated, for the Search view and for Quick Open — S-159', async ({
    page,
  }) => {
    await openFolderWith(page, { 'a.ts': 'TODO\n' });

    await openSearchView(page);
    // Two buttons share this label: the workbench's own, and the Search view's — scoped to the
    // side bar, never the one above it.
    await page.getByTestId('sideBar').getByRole('button', { name: 'Help for this screen' }).click();
    await expect(page.getByRole('dialog', { name: 'Help: Search', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await openQuickOpen(page);
    // "Help" is the list's own last item (S-142) — only once there is at least one real result
    // above it; nothing is open or recent yet in this fresh folder, so a query gives it one.
    await paletteOf(page).getByRole('combobox').fill('a.ts');
    await expect(paletteOf(page).getByRole('option', { name: /a\.ts/ })).toBeVisible();
    await paletteOf(page).getByRole('option', { name: 'Help' }).click();
    await expect(page.getByRole('dialog', { name: 'Help: Quick Open' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // pt-BR: the Search view's own title translates ("Busca") — Quick Open stays a product name
    // in both, by its own i18n catalogue entry, so it is not a second proof of translation here.
    await page.getByRole('button', { name: /^Language: / }).click();
    await page.getByRole('menuitemradio', { name: 'Português (Brasil)' }).click();

    // Search is already the active view from before the locale switch — clicking its own
    // already-pressed button again would only close it (same toggle as S-158's own finding).
    await page.getByTestId('sideBar').getByRole('button', { name: 'Ajuda desta tela' }).click();
    await expect(page.getByRole('dialog', { name: 'Ajuda: Busca', exact: true })).toBeVisible();
  });
});
