import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { openSignedIn } from './auth';
import type { WorkbenchSuite } from './folder-tree';
import { cardFor, send } from './history';
import { openFromDraft } from './workbench';
import type { ScenarioUser } from '../scenarios';

/**
 * The Explorer and the editor of plan 07, from the outside — what every spec of the files of a
 * folder reaches for: the tree, the editor and what Monaco draws, the disk under them, and the
 * scripted Claude writing into the same folder.
 */

/** The address of a file of a folder in the workbench. */
export function fileAddress(folder: string, file: string): string {
  return `/workbench?${new URLSearchParams({ folder, file }).toString()}`;
}

/** A name of this test alone — the trail of the user is shared by every spec of the run. */
export function unique(stem: string): string {
  return `${stem}-${randomUUID().slice(0, 8)}`;
}

/** A pattern that matches `text` literally. */
export function literally(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The tree of the Explorer of the folder tab on screen. */
export function treeOf(page: Page): Locator {
  return page.getByRole('tree', { name: 'Files' });
}

/** One row of the tree, by its name. */
export function rowOf(page: Page, name: string): Locator {
  return treeOf(page).getByRole('treeitem', { name, exact: true });
}

/** The editor of a file, on screen — Monaco's from `md` up, the text area below it. */
export function editorOf(page: Page, name: string): Locator {
  return page.getByRole('textbox', { name: `Editor of ${name}` });
}

/** The lines Monaco draws, one block per editor on screen. */
export function linesOf(page: Page): Locator {
  return page.locator('.monaco-editor .view-lines');
}

/** The editor tabs of a group, by the place of the group. */
export function stripOf(page: Page, place: number): Locator {
  return page.getByRole('navigation', { name: `Open files of group ${String(place)}` });
}

/** An editor tab of a group, by its accessible name — the file's name, then its marks. */
export function editorTab(page: Page, place: number, name: RegExp): Locator {
  return stripOf(page, place).getByRole('button', { name });
}

/** The tab of a file in the first group with no mark at all — saved, not a preview, not pinned. */
export function cleanTab(page: Page, name: string): Locator {
  return editorTab(page, 1, new RegExp(`^${literally(name)}$`));
}

/**
 * Waits for Monaco to hold a file: its input is there — of no size, so never "visible" — and the
 * first line asked for is drawn.
 */
export async function monacoShows(page: Page, name: string, text: string): Promise<void> {
  await expect(editorOf(page, name).first()).toBeAttached();
  await expect(linesOf(page).first()).toContainText(text);
}

/** Types at the end of the file in the editor of `name`, the way a person does. */
export async function typeAtEnd(page: Page, name: string, text: string, which = 0): Promise<void> {
  await editorOf(page, name).nth(which).focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}

/** What a file holds on disk — `null` while it is not there. */
export function contentOf(file: string): string | null {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** Saves with Ctrl+S and waits for the disk to hold `content`. */
export async function savedAs(page: Page, file: string, content: string): Promise<void> {
  await page.keyboard.press('Control+S');
  await expect.poll(() => fs.readFileSync(file, 'utf8')).toBe(content);
}

/** Picks one action of the context menu of a row, as a right click opens it. */
export async function fromMenuOf(page: Page, row: string, action: string): Promise<void> {
  await rowOf(page, row).click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'File actions' })
    .getByRole('menuitem', { name: new RegExp(`^${action}`) })
    .click();
}

/** A folder of the test, its real path, with the files given written into it. */
export function folderWith(folder: string, files: Readonly<Record<string, string>>): string {
  const real = fs.realpathSync(folder);

  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(real, name)), { recursive: true });
    fs.writeFileSync(path.join(real, name), content);
  }

  return real;
}

/** One fact of the files of the Audit screen: what was done, to which file. */
export function fileFact(page: Page, act: string, file: string): Locator {
  return page.getByRole('listitem', { name: new RegExp(`^${act} \\S*${literally(file)} at `) });
}

/** Where a spec opens a session from: its suite, its user, and what ends the session after it. */
export interface SessionSide {
  readonly suite: WorkbenchSuite;
  readonly user: ScenarioUser;
  opened(sessionId: string): void;
}

/**
 * Signs in on a file of a folder, opens a session in its tab and answers the session — the file
 * open in the editor, the chat beside it.
 */
export async function claudeBeside(
  page: Page,
  side: SessionSide,
  folder: string,
  file: string,
  text: string,
): Promise<string> {
  await side.suite.openTab(folder);
  await openSignedIn(page, side.user, fileAddress(folder, file));
  await expect(page.getByText('Connected', { exact: true }).first()).toBeVisible();
  await monacoShows(page, file, text);
  const sessionId = await openFromDraft(page);
  side.opened(sessionId);

  return sessionId;
}

/**
 * A recorded turn that writes a file, its write allowed on the card, and its end — one more summary
 * of a turn in the conversation, whatever turns the session had before (plan 08, B-23).
 */
export async function claudeWrites(page: Page, fixture: string): Promise<void> {
  const turnsEnded = page.getByText(/^Turn(?: ended)?: /);
  const before = await turnsEnded.count();

  await send(page, `do the work [fixture:${fixture}]`);
  await cardFor(page, 'Write').getByRole('button', { name: 'Allow once' }).click();
  await expect(turnsEnded).toHaveCount(before + 1);
  await expect(page.getByText('Idle', { exact: true })).toBeVisible();
}
