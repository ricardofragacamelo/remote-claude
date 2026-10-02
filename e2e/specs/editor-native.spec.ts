import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { scenario } from '../scenarios';
import { tabOf } from '../fixtures/workbench';
import { workbenchSuite, type FolderTree } from '../fixtures/folder-tree';
import { openSignedIn } from '../fixtures/auth';

/**
 * The editor's own behaviours, through the door a person uses — plan 07, B-36 (S-243…S-246).
 *
 * Find and replace, go to line and the undo history are Monaco's, and Monaco needs a real browser:
 * jsdom runs the editor on the simplified mode's adapter of the same port (07 · D-09), so these are
 * proved here, on the build that ships. The file is opened by its address — `?folder=…&file=…` — and
 * what the editor did is read back from the disk after a save.
 */

const native = scenario('editor-native');
const labels = native.expect as Record<
  | 'findLabel'
  | 'replaceLabel'
  | 'regexToggle'
  | 'caseToggle'
  | 'wordToggle'
  | 'selectionToggle'
  | 'replaceAll',
  string
>;

const suite = workbenchSuite(native.user);

/** The address of a file of a folder in the workbench. */
function fileAddress(folder: string, file: string): string {
  return `/workbench?${new URLSearchParams({ folder, file }).toString()}`;
}

/** The editor of a file, on screen — Monaco's, named for the file. */
function editorOf(page: Page, name: string): Locator {
  return page.getByRole('textbox', { name: `Editor of ${name}` }).first();
}

/** The control of the find widget, by its label. */
function findControl(page: Page, role: 'textbox' | 'checkbox' | 'button', label: string): Locator {
  return page.locator('.find-widget').getByRole(role, { name: new RegExp(`^${label}`) });
}

/** An editor tab of the first group, by the name of its file. */
function editorTab(page: Page, name: string): Locator {
  return page
    .getByRole('navigation', { name: 'Open files of group 1' })
    .getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')}`) });
}

/**
 * A folder of the test — `alpha` of a tree — with one file in it, opened in the editor; the folders
 * named in `others` are open in tabs of their own before the page reads the tabs.
 */
async function editing(
  page: Page,
  file: string,
  content: string,
  others: (tree: FolderTree) => readonly string[] = () => [],
): Promise<{ folder: string; file: string; tree: FolderTree }> {
  const tree = suite.tree();
  const folder = fs.realpathSync(tree.alpha);
  fs.writeFileSync(path.join(folder, file), content);

  for (const other of others(tree)) {
    await suite.openTab(fs.realpathSync(other));
  }

  await suite.openTab(folder);
  await openSignedIn(page, native.user, fileAddress(folder, file));
  // Monaco takes the keys through an input of no size, which is never "visible": the editor is ready
  // when it is there **and** the file's first line is drawn.
  await expect(editorOf(page, file)).toBeAttached();
  await expect(page.locator('.monaco-editor .view-lines').first()).toContainText(
    content.split('\n')[0] ?? '',
  );
  await editorOf(page, file).focus();

  return { folder, file: path.join(folder, file), tree };
}

/** Saves with Ctrl+S and waits for the disk to hold `expected`. */
async function savedAs(page: Page, file: string, expected: string): Promise<void> {
  await page.keyboard.press('Control+S');
  await expect.poll(() => fs.readFileSync(file, 'utf8')).toBe(expected);
}

test(`${native.id} — find and replace with a regular expression, the case, a whole word and the selection (S-243)`, async ({
  page,
}) => {
  const { file } = await editing(page, 'words.txt', 'cat Cat cats\ndog cat\n');

  await page.keyboard.press('Control+H');
  await findControl(page, 'textbox', labels.findLabel).fill('cat');
  await findControl(page, 'checkbox', labels.caseToggle).click();
  await findControl(page, 'checkbox', labels.wordToggle).click();
  await findControl(page, 'textbox', labels.replaceLabel).fill('fox');
  await findControl(page, 'button', labels.replaceAll).click();
  await editorOf(page, 'words.txt').focus();
  await savedAs(page, file, 'fox Cat cats\ndog fox\n');

  await page.keyboard.press('Control+H');
  await findControl(page, 'checkbox', labels.caseToggle).click();
  await findControl(page, 'checkbox', labels.wordToggle).click();
  await findControl(page, 'checkbox', labels.regexToggle).click();
  await findControl(page, 'textbox', labels.findLabel).fill('(c|C)ats?');
  await findControl(page, 'textbox', labels.replaceLabel).fill('[$1]');
  await findControl(page, 'button', labels.replaceAll).click();
  await editorOf(page, 'words.txt').focus();
  await savedAs(page, file, 'fox [C] [c]\ndog fox\n');

  // Only in the selection: the second line, selected, is the only one that changes.
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Control+H');
  await findControl(page, 'checkbox', labels.selectionToggle).click();
  await findControl(page, 'textbox', labels.findLabel).fill('fox');
  await findControl(page, 'textbox', labels.replaceLabel).fill('wolf');
  await findControl(page, 'button', labels.replaceAll).click();
  await editorOf(page, 'words.txt').focus();
  await savedAs(page, file, 'fox [C] [c]\ndog wolf\n');
});

test(`${native.id} — an invalid regular expression is said inline, and nothing is replaced (S-244)`, async ({
  page,
}) => {
  const { file } = await editing(page, 'regex.txt', 'a(b)c\n');

  await page.keyboard.press('Control+H');
  await findControl(page, 'checkbox', labels.regexToggle).click();
  const find = findControl(page, 'textbox', labels.findLabel);
  await find.fill('(b');
  await expect(find).toHaveAttribute('aria-invalid', 'true');

  await findControl(page, 'textbox', labels.replaceLabel).fill('X');
  await findControl(page, 'button', labels.replaceAll).click();
  await editorOf(page, 'regex.txt').focus();
  await page.keyboard.press('Control+S');
  await expect.poll(() => fs.readFileSync(file, 'utf8')).toBe('a(b)c\n');
});

test(`${native.id} — going to a line past the end goes to the last one (S-245)`, async ({
  page,
}) => {
  await editing(page, 'lines.txt', 'one\ntwo\nthree\nfour\n');

  await page.keyboard.press('Control+G');
  await page.keyboard.type('999');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: /^Ln 5, Col 1/ })).toBeVisible();
});

test(`${native.id} — undo and redo go across a save, and a reload from disk starts over only its own tab (S-246)`, async ({
  page,
}) => {
  const { folder, file, tree } = await editing(page, 'history.txt', 'start\n', (each) => [
    each.gamma,
  ]);
  const gamma = tree.gamma;
  const other = path.join(folder, 'other.txt');
  fs.writeFileSync(other, 'other\n');

  // Across a save: the save is a point of the history, not its end.
  await page.keyboard.press('Control+End');
  await page.keyboard.type('one');
  await savedAs(page, file, 'start\none');
  await page.keyboard.type(' two');
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  await savedAs(page, file, 'start\n');
  await page.keyboard.press('Control+Shift+Z');
  await savedAs(page, file, 'start\none');

  // A second file of the folder, opened from the trail above the editor, with a history of its own.
  await page.getByRole('button', { name: 'history.txt — show what is beside it' }).click();
  await page.getByRole('menuitem', { name: 'other.txt' }).click();
  await editorOf(page, 'other.txt').focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('mine');
  await savedAs(page, other, 'other\nmine');

  // The first file changes on disk while its tab is clean: coming back to the folder reloads it…
  await editorTab(page, 'history.txt').click();
  fs.writeFileSync(file, 'from disk\n');
  await tabOf(page, path.basename(gamma)).click();
  await tabOf(page, path.basename(folder)).click();
  await editorTab(page, 'history.txt').click();
  await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('from disk');

  // …and its history starts over: there is nothing to undo.
  await editorOf(page, 'history.txt').focus();
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+S');
  await expect.poll(() => fs.readFileSync(file, 'utf8')).toBe('from disk\n');

  // The other file's history went through the reload of the first untouched.
  await editorTab(page, 'other.txt').click();
  await editorOf(page, 'other.txt').focus();
  await page.keyboard.press('Control+Z');
  await savedAs(page, other, 'other\n');
});
