import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import {
  allowOnce,
  cardFor,
  changesRegion,
  modeChip,
  panelOf,
  recordedTurn,
  send,
  showChangesButton,
  turnSummaries,
} from '../fixtures/claude-panel';
import { contentOf, folderWith, literally } from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { sessionInTab } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * What Claude changes, through the door a person uses — plan 08, F6, B-55 (S-261…S-263).
 *
 * Every assertion about a file is read from **the disk**, never from the screen: the scripted Claude
 * performs the edits its recording made, in the folder its session runs in, so the preview, the list
 * of changes, the rejection and its undo are all about bytes the product itself wrote during the run.
 */

const changes = scenario('panel-changes');
const expected = changes.expect as {
  editTurn: string;
  asks: string[];
  before: Record<string, string>;
  after: Record<string, string>;
  previewRemoved: string;
  previewAdded: string;
  changed: string[];
  rejectedFile: string;
  planTurn: string;
  planFiles: Record<string, string>;
  planAsksBefore: string[];
  planAsksAfter: string[];
  planMode: string;
  approvedMode: string;
  goOn: string;
  planHeading: string;
  written: string;
};

const suite = workbenchSuite(changes.user);
const opened = sessionsOpened(suite.user);

/** A folder of the test with `files`, as a tab, and a session opened in it. */
async function sessionWith(page: Page, files: Readonly<Record<string, string>>): Promise<string> {
  const folder = folderWith(suite.tree().gamma, files);
  await suite.openTab(folder);
  opened(await sessionInTab(page, changes.user, folder));

  return folder;
}

/** The recorded turn that edits and writes three files, each of its four questions allowed. */
async function claudeEdits(page: Page): Promise<void> {
  await recordedTurn(page, expected.editTurn, expected.asks);
}

/** The view of what the session changed, shown in the panel. */
async function changesView(page: Page): Promise<Locator> {
  await showChangesButton(page).click();
  const view = changesRegion(page);
  await expect(view).toBeVisible();

  return view;
}

/** The row of one file of the view. */
function rowOf(view: Locator, name: string): Locator {
  return view
    .getByRole('list', { name: 'Files the session changed' })
    .getByRole('listitem')
    .filter({
      has: view.page().getByRole('button', { name: new RegExp(`^${literally(name)} \\(`) }),
    });
}

test(`${changes.id} — the permission of an Edit previews it against the disk, the disk changes, and the Changes view lists the files (S-261)`, async ({
  page,
}) => {
  const folder = await sessionWith(page, expected.before);
  const summaries = await turnSummaries(page).count();

  await send(page, `do the work [fixture:${expected.editTurn}]`);

  // The first question: the Edit, previewed against the file as it is on disk now.
  const edit = cardFor(page, 'Edit');
  const preview = edit.getByRole('group', { name: 'What this change would do to the file' });
  await expect(preview).toContainText(expected.previewRemoved);
  await expect(preview).toContainText(expected.previewAdded);
  expect(contentOf(path.join(folder, 'app.js'))).toBe(expected.before['app.js']);

  for (const toolName of expected.asks) {
    await allowOnce(cardFor(page, toolName).first()).click();
  }
  await expect(turnSummaries(page)).toHaveCount(summaries + 1);

  // The disk has what the turn wrote...
  for (const [name, content] of Object.entries(expected.after)) {
    expect(contentOf(path.join(folder, name))).toBe(content);
  }

  // ...and the view lists every file the session changed.
  const view = await changesView(page);
  for (const name of expected.changed) {
    await expect(rowOf(view, name)).toHaveCount(1);
  }
});

test(`${changes.id} — a change and a whole file rejected from the Changes view, and the rejection undone (S-262)`, async ({
  page,
}) => {
  const folder = await sessionWith(page, expected.before);
  await claudeEdits(page);
  const view = await changesView(page);
  const app = path.join(folder, 'app.js');
  const notes = path.join(folder, 'notes.txt');

  // One change of app.js, from its hunks: its first line is back as it was.
  await rowOf(view, 'app.js').getByRole('button', { name: 'Show the changes of app.js' }).click();
  await rowOf(view, 'app.js').getByRole('button', { name: 'Reject this change' }).first().click();
  await expect
    .poll(() => contentOf(app)?.split('\n')[0])
    .toBe(expected.before['app.js']?.split('\n')[0]);

  // The whole of notes.txt, which the session created: it is gone from the disk and from the list.
  await rowOf(view, 'notes.txt')
    .getByRole('button', { name: 'Reject — put the file back as it was before the session' })
    .click();
  await expect.poll(() => contentOf(notes)).toBeNull();
  await expect(rowOf(view, 'notes.txt')).toHaveCount(0);

  // Undone from the notice that said it: the file is back, byte for byte, and listed again.
  await page
    .getByRole('listitem')
    .filter({ hasText: expected.rejectedFile })
    .getByRole('button', { name: 'Undo', exact: true })
    .click();
  await expect.poll(() => contentOf(notes)).toBe(expected.after['notes.txt']);
  await expect(rowOf(view, 'notes.txt')).toHaveCount(1);
});

test(`${changes.id} — in plan mode, approving the plan changes the mode and Claude goes on (S-263)`, async ({
  page,
}) => {
  const folder = await sessionWith(page, expected.planFiles);

  await modeChip(page).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${expected.planMode}`) }).click();
  await expect(modeChip(page, expected.planMode)).toBeVisible();

  const summaries = await turnSummaries(page).count();
  await send(page, `plan it [fixture:${expected.planTurn}]`);
  for (const toolName of expected.planAsksBefore) {
    await allowOnce(cardFor(page, toolName)).click();
  }

  // The plan, in its own card: approved, to go on asking before each edit.
  const plan = panelOf(page).getByRole('listitem', { name: 'The plan Claude proposes' });
  await expect(plan.getByRole('heading', { name: expected.planHeading })).toBeVisible();
  expect(contentOf(path.join(folder, expected.written))).toBeNull();
  await plan.getByRole('radio', { name: expected.goOn }).check();
  await plan.getByRole('button', { name: 'Approve the plan' }).click();
  await expect(modeChip(page, expected.approvedMode)).toBeVisible();

  // And Claude goes on: what it asks next is answered, the turn ends, and the file is on disk.
  for (const toolName of expected.planAsksAfter) {
    await allowOnce(cardFor(page, toolName)).click();
  }
  await expect(turnSummaries(page)).toHaveCount(summaries + 1);
  expect(contentOf(path.join(folder, expected.written))).not.toBeNull();
});
