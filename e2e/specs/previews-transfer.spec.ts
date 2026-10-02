import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import {
  contentOf,
  editorOf,
  editorTab,
  fileAddress,
  folderWith,
  fromMenuOf,
  monacoShows,
  rowOf,
  typeAtEnd,
} from '../fixtures/explorer';
import { workbenchSuite } from '../fixtures/folder-tree';
import { workbenchAddress } from '../fixtures/workbench';
import { readZip } from '../fixtures/zip';
import { scenario } from '../scenarios';

/**
 * Previews and transfer of plan 07 through the door a person uses: F7, B-54 (S-325…S-327, S-360).
 *
 * What only the whole stack can say. The image of a markdown preview is a file of the folder, read
 * through `raw` into a blob — drawn, not a broken icon; the preview follows the buffer, not the disk.
 * A file dropped from the desktop arrives **on disk** where it was dropped, and the zip of a folder
 * is read back by a reader of its own (`yauzl`), entry by entry. A binary file is shown in
 * hexadecimal from the bytes the test wrote. And the transfer works without a mouse: the context
 * menu opened from the keyboard, the browser's file dialog, the palette, the shortcut.
 *
 * The browser of the suite has no save dialog it can answer (`showSaveFilePicker` opens a native
 * one): it is removed before the page loads, so a download goes the way of every browser without it
 * — a link to a blob the page made — and arrives as a Playwright download (07 · D-26).
 *
 * Every test works in a tree of folders of its own inside the root, and starts and ends with no tab.
 */

interface NamedFile {
  name: string;
  content: string;
}

const transfer = scenario('previews-transfer');
const expected = transfer.expect as {
  markdown: string;
  markdownText: string;
  heading: string;
  imagePath: string;
  imageAlt: string;
  pngBase64: string;
  typedLive: string;
  folder: string;
  kept: NamedFile;
  dropped: NamedFile;
  picked: NamedFile;
  report: NamedFile;
  binary: string;
  bytes: number[];
  hexTitle: string;
  rows: { offset: string; hex: string; text: string }[];
  uploadFiles: string;
  download: string;
};

const suite = workbenchSuite(transfer.user);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(globalThis, 'showSaveFilePicker');
  });
});

/** The preview of a file, wherever it is on screen. */
function previewOf(page: Page, name: string): Locator {
  return page.getByRole('region', { name: `Preview of ${name}` });
}

/** A folder of the test with the folder of the transfer in it, open in its tab, the tree on screen. */
async function folderOpen(page: Page, files: Readonly<Record<string, string>>): Promise<string> {
  const gamma = folderWith(suite.tree().gamma, files);
  await suite.openTab(gamma);
  await openSignedIn(page, transfer.user, workbenchAddress(gamma));
  await expect(rowOf(page, expected.folder)).toBeVisible();

  return gamma;
}

/**
 * Drops a file on a row of the tree as the desktop does: a `drop` whose `DataTransfer` carries a
 * `File` — what the browser hands the page when a file of the desktop is let go over it.
 */
async function dropFromDesktop(page: Page, row: Locator, file: NamedFile): Promise<void> {
  const carried = await page.evaluateHandle(({ name, content }) => {
    // The page's own DataTransfer — the suite is typed without the DOM, so it is named here.
    const scope = globalThis as unknown as {
      DataTransfer: new () => { items: { add(file: File): unknown } };
    };
    const data = new scope.DataTransfer();
    data.items.add(new File([content], name, { type: 'text/plain' }));
    return data;
  }, file);

  await row.dispatchEvent('dragenter', { dataTransfer: carried });
  await row.dispatchEvent('dragover', { dataTransfer: carried });
  await row.dispatchEvent('drop', { dataTransfer: carried });
}

/** Waits for the download `act` starts, saved where the test can read it. */
async function downloaded(
  page: Page,
  act: () => Promise<void>,
): Promise<{
  download: Download;
  file: string;
}> {
  const [download] = await Promise.all([page.waitForEvent('download'), act()]);
  const file = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(file);

  return { download, file };
}

/** The files of the folder of the transfer, as the zip of it names them. */
function zipped(...files: NamedFile[]): Record<string, string> {
  return Object.fromEntries(
    files.map((each) => [`${expected.folder}/${each.name}`, each.content] as const),
  );
}

/** The palette, opened from the keyboard, filtered to commands named like `name`. */
async function paletteWith(page: Page, name: string): Promise<Locator> {
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await page.keyboard.type(`>${name}`);

  return palette;
}

test.describe('B-54 — previews and transfer through the user’s door', () => {
  test(`${transfer.id} — a markdown file with a relative image, previewed to the side and followed as it is typed (S-325)`, async ({
    page,
  }) => {
    const name = expected.markdown;
    const gamma = folderWith(suite.tree().gamma, { [name]: expected.markdownText });
    fs.mkdirSync(path.join(gamma, path.dirname(expected.imagePath)), { recursive: true });
    fs.writeFileSync(
      path.join(gamma, expected.imagePath),
      Buffer.from(expected.pngBase64, 'base64'),
    );
    await suite.openTab(gamma);
    await openSignedIn(page, transfer.user, fileAddress(gamma, name));
    await monacoShows(page, name, expected.heading);

    // Ctrl+K V from the editor: the preview in a group of its own, beside the file.
    await editorOf(page, name).focus();
    await page.keyboard.press('Control+K');
    await page.keyboard.press('V');
    await expect(editorTab(page, 2, new RegExp(`^Preview ${name}`))).toBeVisible();
    const preview = previewOf(page, name);
    await expect(preview.getByRole('heading', { name: expected.heading })).toBeVisible();

    // The image is the file of the folder, fetched into a blob and drawn — never a URL of the API.
    const image = preview.getByRole('img', { name: expected.imageAlt });
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect
      .poll(() =>
        image.evaluate((each) => (each as unknown as { naturalWidth: number }).naturalWidth),
      )
      .toBe(1);

    // Typed in the editor, shown in the preview at once — before any save.
    await typeAtEnd(page, name, expected.typedLive);
    await expect(preview.getByText(expected.typedLive)).toBeVisible();
    await expect(editorTab(page, 1, new RegExp(`^${name}, Unsaved changes`))).toBeVisible();
    expect(contentOf(path.join(gamma, name))).toBe(expected.markdownText);
  });

  test(`${transfer.id} — a file dropped from the desktop onto a folder of the tree, and the folder downloaded as a zip (S-326)`, async ({
    page,
  }) => {
    const { folder, kept, dropped } = expected;
    const gamma = await folderOpen(page, { [`${folder}/${kept.name}`]: kept.content });

    await dropFromDesktop(page, rowOf(page, folder), dropped);
    await expect
      .poll(() => contentOf(path.join(gamma, folder, dropped.name)))
      .toBe(dropped.content);

    // Downloaded from the context menu of the folder: one zip with what the folder holds now.
    const { download, file } = await downloaded(page, () =>
      fromMenuOf(page, folder, expected.download),
    );
    expect(download.suggestedFilename()).toBe(`${folder}.zip`);
    const contents = await readZip(file);
    expect(contents.files).toEqual(zipped(dropped, kept));
  });

  test(`${transfer.id} — a binary file opens in hexadecimal, read-only (S-327)`, async ({
    page,
  }) => {
    const name = expected.binary;
    const gamma = fs.realpathSync(suite.tree().gamma);
    fs.writeFileSync(path.join(gamma, name), Buffer.from(expected.bytes));
    await suite.openTab(gamma);
    await openSignedIn(page, transfer.user, fileAddress(gamma, name));

    await expect(page.getByText(expected.hexTitle.replace('{{path}}', name))).toBeVisible();
    const table = page.getByRole('table', {
      name: `Bytes 0 to ${String(expected.bytes.length - 1)} of ${name}`,
    });
    const rows = table.getByRole('row');
    // The header, then one row per sixteen bytes — the last as short as the file.
    await expect(rows).toHaveCount(expected.rows.length + 1);
    for (const [index, row] of expected.rows.entries()) {
      await expect(rows.nth(index + 1).getByRole('cell')).toHaveText([
        row.offset,
        row.hex,
        row.text,
      ]);
    }

    // Nothing to type into: no editor of the file, Monaco or otherwise.
    await expect(editorOf(page, name)).toHaveCount(0);
    await expect(page.locator('.monaco-editor')).toHaveCount(0);
  });

  test(`${transfer.id} — Upload files here… and Download, in the context menu and the palette, keyboard only (S-360)`, async ({
    page,
  }) => {
    const { folder, kept, picked, report } = expected;
    const gamma = await folderOpen(page, {
      [`${folder}/${kept.name}`]: kept.content,
      [report.name]: report.content,
    });

    // The focus on the folder's row; from here on, only keys.
    await rowOf(page, folder).focus();
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu', { name: 'File actions' });
    await expect(menu.getByRole('menuitem', { name: expected.uploadFiles })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: expected.download })).toBeVisible();

    // Upload files here…: the browser's own dialog, into the folder of the row.
    await page.keyboard.type('U');
    await expect(menu.getByRole('menuitem', { name: expected.uploadFiles })).toBeFocused();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.keyboard.press('Enter'),
    ]);
    await chooser.setFiles({
      name: picked.name,
      mimeType: 'text/plain',
      buffer: Buffer.from(picked.content),
    });
    await expect.poll(() => contentOf(path.join(gamma, folder, picked.name))).toBe(picked.content);

    // The palette has both; Download from it takes the folder of the focus, as a zip.
    await expect(rowOf(page, folder)).toBeFocused();
    const palette = await paletteWith(page, expected.uploadFiles);
    await expect(palette.getByRole('option', { name: expected.uploadFiles })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
    await expect(rowOf(page, folder)).toBeFocused();

    const zip = await downloaded(page, async () => {
      const commands = await paletteWith(page, expected.download);
      await expect(commands.getByRole('option', { name: expected.download })).toBeVisible();
      await page.keyboard.press('Enter');
    });
    expect(zip.download.suggestedFilename()).toBe(`${folder}.zip`);
    expect((await readZip(zip.file)).files).toEqual(zipped(kept, picked));

    // And its shortcut, on a file reached with the arrows: the file itself.
    await expect(rowOf(page, folder)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rowOf(page, report.name)).toBeFocused();
    const single = await downloaded(page, () => page.keyboard.press('Alt+Shift+D'));
    expect(single.download.suggestedFilename()).toBe(report.name);
    expect(fs.readFileSync(single.file, 'utf8')).toBe(report.content);
  });
});
