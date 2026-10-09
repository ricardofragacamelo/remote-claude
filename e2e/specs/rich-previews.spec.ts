import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { connectedStatus, panelOf } from '../fixtures/claude-panel';
import { editorOf, fileAddress, folderWith, monacoShows, rowOf } from '../fixtures/explorer';
import { workbenchSuite } from '../fixtures/folder-tree';
import { scrollsSideways, violationsOn } from '../fixtures/page-checks';
import { sendFirstPrompt, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The rich previews of plan 21 through the door a person uses: F4, B-20…B-23 (S-15, S-17, S-18,
 * S-34, S-40, S-44, S-50, S-51, S-69…S-74).
 *
 * What only a browser that lays pages out can say. The reader is pdf.js itself — its pages, its text
 * layer, its links and its search — over the PDFs `scripts/pdf-fixtures.mjs` writes; the table of a
 * markdown preview scrolls in its own box, and a diagram is an SVG of a real size, drawn by Mermaid.
 * Claude's answer with a diagram is a recorded turn of the fake SDK (21 · D-15).
 *
 * Every test works in a folder of its own inside the root, and starts and ends with no tab.
 */

const rich = scenario('rich-previews');
const expected = rich.expect as {
  folder: string;
  reader: string;
  locked: string;
  password: string;
  pages: number;
  pageTwoLine: string;
  search: string;
  matches: number;
  outlineEntry: string;
  outlinePage: number;
  thumbnailPage: number;
  namedLink: string;
  namedLinkPage: number;
  explicitLink: string;
  explicitLinkPage: number;
  webLink: string;
  markdown: string;
  diagramText: string;
  answerTurn: string;
  answerDiagramText: string;
  tags: string[];
};

const suite = workbenchSuite(rich.user);

/** The PDFs the script writes, read from where they are versioned. */
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'files');

/** A markdown file with a wide table and a diagram — what B-22 previews. */
const NOTES = [
  '# Notes',
  '',
  '| Step | Who | What happens | Where | When | Why | Path |',
  '|---|---|---|---|---|---|---|',
  `| 1 | the client | ${'the request is written, signed and sent '.repeat(4)}| the edge | at once | to be served | ${'/a/very/long/path/without/spaces'.repeat(6)} |`,
  '| 2 | the server | the answer leaves | the core | later | to answer | /b |',
  '',
  '```mermaid',
  'graph TD',
  '  accTitle: How a request is served',
  '  Request --> Server',
  '  Server --> Answer',
  '```',
].join('\n');

/** A folder of the test with the PDFs and the notes in it, open in its tab, the tree on screen. */
async function folderOpen(page: Page, open?: string): Promise<string> {
  const folder = folderWith(suite.tree().gamma, {
    [`${expected.folder}/${expected.markdown}`]: NOTES,
  });
  for (const name of ['reader.pdf', 'locked.pdf', 'scripted.pdf']) {
    fs.copyFileSync(path.join(FIXTURES, name), path.join(folder, expected.folder, name));
  }
  await suite.openTab(folder);
  await openSignedIn(
    page,
    rich.user,
    open === undefined
      ? workbenchAddress(folder)
      : fileAddress(folder, `${expected.folder}/${open}`),
  );

  return folder;
}

/** The reader of a PDF, once its pages are laid out. */
async function readerOf(page: Page, name: string): Promise<Locator> {
  const reader = page.getByRole('group', { name: `PDF reader of ${name}` });
  await expect(pageField(reader)).toBeEnabled();
  return reader;
}

function pageField(reader: Locator): Locator {
  return reader.getByRole('textbox', { name: 'Page', exact: true });
}

function pagesOf(reader: Locator, name: string): Locator {
  return reader.getByRole('region', { name: `Pages of ${name}` });
}

/** Opens a PDF of the folder from the tree, the way a person does. */
async function openFromTree(page: Page, name: string): Promise<Locator> {
  await rowOf(page, expected.folder).click();
  await rowOf(page, name).click();
  return readerOf(page, name);
}

/** The reader of `reader.pdf`, opened from the tree of a folder of the test, and its pages. */
async function readerOpen(
  page: Page,
): Promise<{ reader: Locator; pages: Locator; folder: string }> {
  const folder = await folderOpen(page);
  const reader = await openFromTree(page, expected.reader);
  return { reader, pages: pagesOf(reader, expected.reader), folder };
}

/** The preview of the notes, opened to the side of their editor with Ctrl+K V. */
async function notesPreview(page: Page): Promise<Locator> {
  await monacoShows(page, expected.markdown, 'Notes');
  await editorOf(page, expected.markdown).focus();
  await page.keyboard.press('Control+K');
  await page.keyboard.press('V');
  const preview = page.getByRole('region', { name: `Preview of ${expected.markdown}` });
  await expect(preview.getByRole('table')).toBeVisible();
  return preview;
}

/** Opens the side panel of the reader, on its outline. */
async function showPanel(reader: Locator): Promise<Locator> {
  await reader.getByRole('button', { name: 'Show the outline and the thumbnails' }).click();
  const tree = reader.getByRole('tree', { name: `Outline of ${expected.reader}` });
  await expect(tree).toBeVisible();
  return tree;
}

/** Types a page in the field and goes there. */
async function goTo(reader: Locator, page: number): Promise<void> {
  await pageField(reader).fill(String(page));
  await pageField(reader).press('Enter');
}

test.describe('B-20 — the reader through the user’s door', () => {
  test('21·S-69, S-15 — reads every page in one scroll, the indicator following, and keeps the page when zooming', async ({
    page,
  }) => {
    const { reader, pages } = await readerOpen(page);

    await expect(pageField(reader)).toHaveValue('1');
    await expect(reader.getByText(`of ${String(expected.pages)}`, { exact: true })).toBeVisible();
    await expect(pages.getByRole('region', { name: /^Page \d+$/ })).toHaveCount(expected.pages);

    await pages.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(pageField(reader)).toHaveValue(String(expected.pages));

    await goTo(reader, 5);
    await expect(pageField(reader)).toHaveValue('5');
    await reader.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await reader.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(reader.getByRole('combobox', { name: 'Zoom' })).not.toHaveValue('page-width');
    await expect(pageField(reader)).toHaveValue('5');
  });

  test('21·S-17, S-18 — selects the text of a page, and follows the links of the PDF by the rule', async ({
    page,
  }) => {
    const { reader, pages } = await readerOpen(page);

    await goTo(reader, 2);
    const line = pages.locator('.textLayer').getByText(expected.pageTwoLine);
    await line.selectText();
    const selected = await page.evaluate(() => {
      // The suite is typed without the DOM: the page's own selection, named here.
      const scope = globalThis as unknown as { getSelection(): { toString(): string } | null };
      return scope.getSelection()?.toString() ?? '';
    });
    expect(selected).toContain(expected.pageTwoLine);

    await goTo(reader, 1);
    const links = pages.locator('.annotationLayer a');
    await expect(links.first()).toBeAttached();
    const web = pages.locator(`.annotationLayer a[href="${expected.webLink}"]`);
    await expect(web).toHaveAttribute('target', '_blank');
    await expect(web).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    await expect(pages.locator('.annotationLayer a[href^="javascript:"]')).toHaveCount(0);
    await expect(pages.locator('.annotationLayer a[href^="file:"]')).toHaveCount(0);

    // The named destination, then the explicit one: the first internal links of page 1.
    const internal = pages.locator(
      '.annotationLayer a.internalLink, .annotationLayer a[href^="#"]',
    );
    await internal.nth(0).click();
    await expect(pageField(reader)).toHaveValue(String(expected.namedLinkPage));
    await goTo(reader, 1);
    await internal.nth(1).click();
    await expect(pageField(reader)).toHaveValue(String(expected.explicitLinkPage));
  });

  test('21·S-70 — a PDF with a password: a wrong one is said wrong, the right one opens it', async ({
    page,
  }) => {
    await folderOpen(page);
    await rowOf(page, expected.folder).click();
    await rowOf(page, expected.locked).click();

    const field = page.getByLabel('Password', { exact: true });
    await field.fill('not it');
    await field.press('Enter');
    await expect(page.getByText('That password is not right. Type it again.')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await page.getByLabel('Password', { exact: true }).fill(expected.password);
    await page.getByLabel('Password', { exact: true }).press('Enter');

    const reader = await readerOf(page, expected.locked);
    await expect(reader.getByText(`of ${String(expected.pages)}`, { exact: true })).toBeVisible();
  });
});

test.describe('B-21 — the navigation through the user’s door', () => {
  test('21·S-34, S-40, S-44 — the outline and a thumbnail take you to their page; the search counts, highlights and moves', async ({
    page,
  }) => {
    const { reader } = await readerOpen(page);

    const tree = await showPanel(reader);
    await tree.getByRole('treeitem', { name: 'Part two' }).locator('[data-chevron]').click();
    await tree.getByRole('treeitem', { name: expected.outlineEntry }).click();
    await expect(pageField(reader)).toHaveValue(String(expected.outlinePage));

    await reader.getByRole('tab', { name: 'Thumbnails' }).click();
    const thumbnail = reader.getByRole('button', {
      name: `Page ${String(expected.thumbnailPage)}`,
      exact: true,
    });
    await thumbnail.scrollIntoViewIfNeeded();
    await thumbnail.click();
    await expect(pageField(reader)).toHaveValue(String(expected.thumbnailPage));
    await expect(thumbnail).toHaveAttribute('aria-current', 'page');

    await pagesOf(reader, expected.reader).focus();
    await page.keyboard.press('Control+f');
    const search = reader.getByRole('textbox', { name: `Find in ${expected.reader}` });
    await expect(search).toBeFocused();
    await search.fill(expected.search);
    const count = reader.getByRole('search').getByRole('status');
    await expect(count).toHaveText(`1 of ${String(expected.matches)}`);
    await expect(
      pagesOf(reader, expected.reader).locator('.textLayer .highlight').first(),
    ).toBeVisible();
    await search.press('Enter');
    await expect(count).toHaveText(`2 of ${String(expected.matches)}`);
    await search.press('Shift+Enter');
    await search.press('Shift+Enter');
    await expect(count).toHaveText(`${String(expected.matches)} of ${String(expected.matches)}`);
  });
});

test.describe('B-22 — tables and diagrams through the user’s door', () => {
  test('21·S-50, S-51, S-71 — a wide table scrolls in its box, and a diagram is a drawn SVG', async ({
    page,
  }) => {
    await folderOpen(page, expected.markdown);
    const preview = await notesPreview(page);
    const table = preview.getByRole('table');

    const box = table.locator('xpath=..');
    expect(await box.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await preview.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await scrollsSideways(page)).toBe(false);
    const widest = await table
      .getByRole('cell')
      .evaluateAll((cells) => Math.max(...cells.map((cell) => cell.getBoundingClientRect().width)));
    expect(widest).toBeLessThan(600);

    const diagram = preview.getByRole('img', { name: 'How a request is served' });
    await expect(diagram.locator('svg')).toBeVisible();
    const size = await diagram.locator('svg').boundingBox();
    expect(size?.width ?? 0).toBeGreaterThan(50);
    expect(size?.height ?? 0).toBeGreaterThan(50);
    await expect(diagram).toContainText(expected.diagramText);
  });

  test('21·S-72 — a diagram in an answer of Claude, drawn once the message is complete', async ({
    page,
  }) => {
    const folder = await folderOpen(page);
    await page.goto(workbenchAddress(folder));
    await expect(connectedStatus(page)).toBeVisible();
    await sendFirstPrompt(page, `draw it [fixture:${expected.answerTurn}]`);

    const diagram = panelOf(page).getByRole('img', { name: 'Diagram' });
    await expect(diagram.locator('svg')).toBeVisible();
    await expect(diagram).toContainText(expected.answerDiagramText);
    await expect(panelOf(page).getByRole('table')).toBeVisible();
  });
});

test.describe('B-23 — accessibility and the keyboard', () => {
  test('21·S-73 — axe finds no violation in the reader with its panel and search, nor in a preview with a table and a diagram', async ({
    page,
  }) => {
    const { reader, folder } = await readerOpen(page);
    await showPanel(reader);
    await reader.getByRole('button', { name: 'Find in the PDF' }).click();
    await reader.getByRole('textbox', { name: `Find in ${expected.reader}` }).fill(expected.search);
    expect(await violationsOn(page, expected.tags), 'the reader').toEqual([]);

    await page.goto(fileAddress(folder, `${expected.folder}/${expected.markdown}`));
    const preview = await notesPreview(page);
    await expect(
      preview.getByRole('img', { name: 'How a request is served' }).locator('svg'),
    ).toBeVisible();
    expect(await violationsOn(page, expected.tags), 'the markdown preview').toEqual([]);
  });

  test('21·S-74 — the keyboard alone opens the panel, walks the outline, searches and zooms', async ({
    page,
  }) => {
    const { reader, pages } = await readerOpen(page);

    const zoom = reader.getByRole('combobox', { name: 'Zoom' });
    await pages.focus();
    await page.keyboard.press('Control+=');
    // The step past the width the reader fits: a number, no longer the fit.
    await expect(zoom).toHaveValue(/^\d+(\.\d+)?$/);
    await page.keyboard.press('Control+0');
    await expect(zoom).toHaveValue('page-width');

    const panel = reader.getByRole('button', { name: 'Show the outline and the thumbnails' });
    await panel.focus();
    await page.keyboard.press('Enter');
    const tree = reader.getByRole('tree');
    await tree.getByRole('treeitem', { name: 'Part one' }).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(tree.getByRole('treeitem', { name: expected.outlineEntry })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(pageField(reader)).toHaveValue(String(expected.outlinePage));

    await pages.focus();
    await page.keyboard.press('Control+f');
    await page.keyboard.type(expected.search);
    // The search starts where the reader is — page 9, after the outline took it there.
    await expect(reader.getByRole('search').getByRole('status')).toHaveText(
      `${String(expected.matches)} of ${String(expected.matches)}`,
    );
    await page.keyboard.press('Escape');
    await expect(pages).toBeFocused();
  });
});
