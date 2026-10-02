import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { callApi } from '../fixtures/api';
import { openSignedIn } from '../fixtures/auth';
import {
  claudeBeside,
  cleanTab,
  claudeWrites,
  contentOf,
  editorOf,
  editorTab,
  fileAddress,
  fileFact,
  folderWith,
  fromMenuOf,
  linesOf,
  literally,
  monacoShows,
  rowOf,
  savedAs,
  stripOf,
  typeAtEnd,
  unique,
} from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The local history of plan 07 — the Timeline — through the door a person uses: F8, B-61
 * (S-353…S-355).
 *
 * What only the whole stack can say. Every save that loses a version keeps it first, so three saves
 * are three versions the Timeline lists, read from the server's store; comparing opens what the
 * store kept beside the buffer; a restore is read back from **the disk**. A delete the history can
 * keep asks nothing — the notification brings it back, and the Audit screen the server fills holds
 * both facts. And the scripted Claude writes the very file a restore names: the restore is a write
 * like any other, refused when the disk is not the version the person saw (`FILE_CHANGED`).
 *
 * Every test works in a tree of folders of its own inside the root, and starts and ends with no tab.
 */

const history = scenario('local-history');
const expected = history.expect as {
  file: string;
  first: string;
  typed: [string, string, string];
  reason: string;
  restoredReason: string;
  author: string;
  deletedStem: string;
  deletedContent: string;
  deletedNotice: string;
  undo: string;
  acts: Record<'deleted' | 'restored', string>;
  fixture: string;
  claudeFile: string;
  claudeWrote: string;
  before: string;
  changedByClaude: string;
  refused: string;
};

const suite = workbenchSuite(history.user);
const opened = sessionsOpened(suite.user);
const side = { suite, user: history.user, opened };

/** The Timeline section of the Explorer of the folder tab on screen. */
function timelineOf(page: Page): Locator {
  return page.getByRole('region', { name: 'Timeline' });
}

/** Opens the Timeline, closed until somebody asks for it. */
async function openTimeline(page: Page): Promise<Locator> {
  const timeline = timelineOf(page);
  const toggle = timeline.getByRole('button', { name: 'Timeline', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  return timeline;
}

/** The versions the Timeline lists of a file, newest first. */
function versionsOf(timeline: Locator, file: string): Locator {
  return timeline.getByRole('list', { name: `Versions of ${file}` }).getByRole('listitem');
}

/** One action of a version of the Timeline — named by when the version was kept, so by pattern. */
function actionOf(version: Locator, action: string): Locator {
  return version.getByRole('button', { name: new RegExp(`^${action}`) });
}

/**
 * The two sides of the diff on screen: what Monaco draws on the left and on the right — without the
 * zone where the right side shows the lines it lost.
 */
function sidesOfDiff(page: Page): { original: Locator; modified: Locator } {
  const diff = page.locator('.monaco-diff-editor');

  return {
    original: diff.locator('.editor.original .view-lines:not(.line-delete)'),
    modified: diff.locator('.editor.modified .view-lines:not(.line-delete)'),
  };
}

/** Closes the diff tab of a file with itself, and is back on the file. */
async function closeDiff(page: Page, file: string): Promise<void> {
  await stripOf(page, 1)
    .getByRole('button', { name: `Close ${file} ↔ ${file}` })
    .click();
  await expect(page.locator('.monaco-diff-editor')).toHaveCount(0);
}

/** The versions the server keeps of a file of a folder, as the HTTP API lists them. */
async function storedVersions(folder: string, file: string): Promise<number> {
  const response = await callApi(
    suite.user(),
    `/files/history?${new URLSearchParams({ folder, path: file }).toString()}`,
  );
  expect(response.status).toBe(200);

  return ((await response.json()) as { entries: unknown[] }).entries.length;
}

test.describe('B-61 — the local history through the user’s door', () => {
  test(`${history.id} — saved three times: three versions in the Timeline, compared, and one restored to the disk (S-353)`, async ({
    page,
  }) => {
    const { file: name, first, typed } = expected;
    const gamma = folderWith(suite.tree().gamma, { [name]: first });
    const file = path.join(gamma, name);
    await suite.openTab(gamma);
    await openSignedIn(page, history.user, fileAddress(gamma, name));
    await monacoShows(page, name, first.trim());

    // Three saves, each read back from the disk — each kept the version it replaced.
    let content = first;
    for (const text of typed) {
      await typeAtEnd(page, name, text);
      content = `${content}${text}`;
      await savedAs(page, file, content);
    }
    // Each save is told apart by the word it added.
    const [second, third, fourth] = [typed[0].trim(), typed[1].trim(), typed[2].trim()];

    // The Timeline of the active file: the three, newest first, why, who.
    const timeline = await openTimeline(page);
    await expect(timeline.getByText(`Versions of ${name}`, { exact: true })).toBeVisible();
    const versions = versionsOf(timeline, name);
    await expect(versions).toHaveCount(3);
    for (const version of await versions.all()) {
      await expect(version).toContainText(expected.reason);
      await expect(version).toContainText(`${expected.author} · `);
    }

    // The oldest beside the file now: what the store kept on the left, the buffer on the right.
    await actionOf(versions.nth(2), 'Compare the version of .+ with the file now').click();
    await expect(
      editorTab(page, 1, new RegExp(`^${literally(`${name} ↔ ${name}`)}`)),
    ).toBeVisible();
    await expect(page.getByText(`${name} in the editor`, { exact: true })).toBeVisible();
    const diff = sidesOfDiff(page);
    await expect(diff.original).toContainText(first.trim());
    await expect(diff.original).not.toContainText(second);
    await expect(diff.modified).toContainText(fourth);
    await closeDiff(page, name);

    // Two versions with each other: the one picked first, then the newest — older on the left.
    await actionOf(versions.nth(2), 'Pick the version of').click();
    await actionOf(versions.nth(0), 'Compare the version of .+ with the one picked').click();
    await expect(page.getByText(`${name} in the editor`, { exact: true })).toHaveCount(0);
    await expect(diff.original).toContainText(first.trim());
    await expect(diff.original).not.toContainText(second);
    await expect(diff.modified).toContainText(third);
    await expect(diff.modified).not.toContainText(fourth);
    await closeDiff(page, name);

    // Restored: the buffer has nothing unsaved, so nothing is asked — the disk has the oldest again.
    await cleanTab(page, name).click();
    await actionOf(versions.nth(2), 'Restore the version of').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => contentOf(file)).toBe(first);
    await expect(linesOf(page).first()).not.toContainText(second);
    await expect(cleanTab(page, name)).toBeVisible();

    // And the version it replaced is kept first: four now, the newest from before the restore.
    await expect(versions).toHaveCount(4);
    await expect(versions.nth(0)).toContainText(expected.restoredReason);
    expect(await storedVersions(gamma, name)).toBe(4);
  });

  test(`${history.id} — a file deleted: the notification's Undo brings it back to the disk, and the Audit has both facts (S-354)`, async ({
    page,
  }) => {
    const name = `${unique(expected.deletedStem)}.txt`;
    const gamma = folderWith(suite.tree().gamma, {
      [name]: expected.deletedContent,
      'stay.txt': 'stay\n',
    });
    const file = path.join(gamma, name);
    await suite.openTab(gamma);
    await openSignedIn(page, history.user, workbenchAddress(gamma));
    await expect(rowOf(page, name)).toBeVisible();

    // What the history keeps goes without a question: a notification says so, with Undo.
    await fromMenuOf(page, name, 'Delete');
    const notice = page
      .getByRole('status')
      .filter({ hasText: expected.deletedNotice.replace('{{name}}', name) });
    await expect(notice).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(rowOf(page, name)).toHaveCount(0);
    expect(fs.existsSync(file)).toBe(false);

    // Undo: back where it was, as it was.
    await notice.getByRole('button', { name: expected.undo, exact: true }).click();
    await expect.poll(() => contentOf(file)).toBe(expected.deletedContent);
    await expect(rowOf(page, name)).toBeVisible();
    expect(fs.readFileSync(path.join(gamma, 'stay.txt'), 'utf8')).toBe('stay\n');

    // The two facts, as the Audit screen says them.
    await page.goto('/audit');
    await expect(fileFact(page, expected.acts.deleted, name)).toBeVisible();
    await expect(fileFact(page, expected.acts.restored, name)).toBeVisible();
  });

  test(`${history.id} — a restore over what the scripted Claude wrote since is refused, and the disk keeps Claude's (S-355)`, async ({
    page,
  }) => {
    const name = expected.claudeFile;
    const gamma = folderWith(suite.tree().gamma, { [name]: expected.before });
    const file = path.join(gamma, name);
    await claudeBeside(page, side, gamma, name, expected.before.trim());

    // One save: the version from before the turn is kept.
    await typeAtEnd(page, name, 'saved');
    await savedAs(page, file, `${expected.before}saved`);
    const timeline = await openTimeline(page);
    const versions = versionsOf(timeline, name);
    await expect(versions).toHaveCount(1);

    // Typed again, unsaved — and Claude writes the file under the buffer.
    await typeAtEnd(page, name, ' unsaved');
    await claudeWrites(page, expected.fixture);
    expect(fs.readFileSync(file, 'utf8')).toBe(expected.claudeWrote);
    await expect(page.getByText(expected.changedByClaude)).toBeVisible();

    // Restoring discards the unsaved changes, so it asks first; answered, it names the version the
    // person saw — which is no longer on disk.
    await actionOf(versions.nth(0), 'Restore the version of').click();
    const question = page.getByRole('dialog', {
      name: new RegExp(`^Restore ${literally(name)} to the version of `),
    });
    await expect(question.getByRole('button', { name: 'Keep it as it is' })).toBeFocused();
    await question.getByRole('button', { name: 'Restore', exact: true }).click();

    const refusal = timeline.getByRole('alert').filter({ hasText: expected.refused });
    await expect(refusal).toBeVisible();
    await expect(refusal.getByText(/^Trace /)).toBeVisible();

    // Nothing was written, and nothing was kept: Claude's version stays, the buffer as typed.
    expect(fs.readFileSync(file, 'utf8')).toBe(expected.claudeWrote);
    expect(await storedVersions(gamma, name)).toBe(1);
    await expect(versions).toHaveCount(1);
    await expect(editorOf(page, name)).toBeAttached();
    await expect(linesOf(page).first()).toContainText('unsaved');
  });
});
