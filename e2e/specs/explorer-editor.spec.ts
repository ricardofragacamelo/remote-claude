import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import {
  claudeBeside,
  cleanTab,
  claudeWrites as writes,
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
  typeAtEnd,
  unique,
} from '../fixtures/explorer';
import { sessionsOpened, tabsOf, workbenchSuite } from '../fixtures/folder-tree';
import { callApi } from '../fixtures/api';
import { confirmationOfTheOnlyPoint, lastUndoReport } from '../fixtures/claude-panel';
import { attachFrom, connected } from '../fixtures/live-session';
import { scrollsSideways, violationsOn, widerThanThePage } from '../fixtures/page-checks';
import {
  onWorkbenchOf,
  openThroughDialog,
  tabOf,
  tabStrip,
  workbenchAddress,
} from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The core of plan 07 — the Explorer and the editor — through the door a person uses: F6, B-43…B-45
 * (S-280…S-290).
 *
 * What only the whole stack can say. A save is read back from **the disk**, never from the screen;
 * the three facts of a file's life are read from the Audit screen the server fills; the scripted
 * Claude writes the very file the editor has open, in the folder its session runs in, and the undo of
 * plan 04 meets the human edit that came after it (ADR-013). And what only a browser that lays pages
 * out can judge: two groups side by side, the phone's simplified editor, axe on the stylesheet that
 * ships.
 *
 * Every test works in a tree of folders of its own inside the root, and starts and ends with no tab.
 */

const core = scenario('explorer-editor');
const expected = core.expect as {
  fixture: string;
  claudeFile: string;
  claudeWrote: string;
  before: string;
  template: string;
  acts: Record<'created' | 'moved' | 'deleted', string>;
  changedByClaude: string;
  conflictTitle: string;
  diffTab: string;
  phone: { width: number; height: number };
  tags: string[];
  themes: ('light' | 'dark')[];
  climbing: string;
  refusedTitle: string;
  refused: string;
  keptBecause: string;
  nothingToUndo: string;
  keptNotice: string;
  notKeptBecause: string;
};

const suite = workbenchSuite(core.user);
const opened = sessionsOpened(suite.user);
const side = { suite, user: core.user, opened };

/** The largest file the local history keeps, as the server says it. */
async function historyCeiling(): Promise<number> {
  const response = await callApi(suite.user(), '/files/limits');
  expect(response.status).toBe(200);

  return ((await response.json()) as { historyMaxFileBytes: number }).historyMaxFileBytes;
}

/**
 * Undoes the only turn of a session from a socket of the suite, as another device would, and
 * answers what the server says it did to the disk.
 */
async function undoFromElsewhere(sessionId: string): Promise<Record<string, unknown>> {
  const response = await callApi(suite.user(), `/sessions/${sessionId}/checkpoints`);
  expect(response.status).toBe(200);
  const { checkpoints } = (await response.json()) as { checkpoints: { promptId: string }[] };
  expect(checkpoints).toHaveLength(1);

  const socket = await connected(suite.user());
  try {
    await attachFrom(socket, sessionId, 0);
    const mark = socket.frames.length;
    socket.send('session.rewindFiles', { sessionId, promptId: checkpoints[0]?.promptId ?? '' });
    const rewound = await socket.waitFor(
      (frame) => socket.frames.indexOf(frame) >= mark && frame.type === 'session.rewound',
    );

    return rewound.payload as Record<string, unknown>;
  } finally {
    socket.close();
  }
}

/** The recorded turn that writes `summary.md`, its write allowed on the card, and its end. */
function claudeWrites(page: Page): Promise<void> {
  return writes(page, expected.fixture);
}

test.describe('B-43 — the file cycle through the user’s door', () => {
  test(`${core.id} — open a folder, its tree, a file edited and saved with Ctrl+S: the disk has it (S-280)`, async ({
    page,
  }) => {
    const tree = suite.tree();
    const gamma = folderWith(tree.gamma, { 'notes.txt': 'first line\n' });
    const file = path.join(gamma, 'notes.txt');

    // From the welcome screen, down from the roots, the way a person opens a folder.
    await openSignedIn(page, core.user, '/');
    await page.getByRole('button', { name: 'Open folder…' }).click();
    await openThroughDialog(page, await suite.rootLabel(), [path.basename(tree.base), 'gamma']);
    await page.waitForURL(onWorkbenchOf(gamma));

    await expect(rowOf(page, 'notes.txt')).toBeVisible();
    await rowOf(page, 'notes.txt').dblclick();
    await monacoShows(page, 'notes.txt', 'first line');

    await typeAtEnd(page, 'notes.txt', 'second line');
    await expect(editorTab(page, 1, /^notes\.txt, Unsaved changes/)).toBeVisible();
    await savedAs(page, file, 'first line\nsecond line');
    await expect(editorTab(page, 1, /^notes\.txt$/)).toBeVisible();
  });

  test(`${core.id} — created from a template, renamed and deleted: the three facts in the Audit (S-281)`, async ({
    page,
  }) => {
    const gamma = folderWith(suite.tree().gamma, { 'keep.txt': 'kept\n' });
    const created = `${unique('plan')}.md`;
    const renamed = `${unique('roadmap')}.md`;
    await suite.openTab(gamma);
    await openSignedIn(page, core.user, workbenchAddress(gamma));
    await expect(rowOf(page, 'keep.txt')).toBeVisible();

    // From a template: the name starts as the template's, its stem selected to be typed over.
    await page
      .getByRole('toolbar', { name: 'Explorer actions' })
      .getByRole('button', { name: 'New file from template…' })
      .click();
    const templates = page.getByRole('dialog', { name: 'New file from template' });
    await templates.getByRole('button', { name: new RegExp(`^${expected.template}`) }).click();
    const name = page.getByRole('textbox', { name: 'Name of the new file' });
    await expect(name).toHaveValue('notes.md');
    await expect(name).toBeFocused();
    await page.keyboard.type(created.replace(/\.md$/, ''));
    await page.keyboard.press('Enter');
    // The row being named carries the name typed; the entry's own row is there once the field goes.
    await expect(name).toHaveCount(0);
    await expect(rowOf(page, created)).toBeVisible();
    await expect
      .poll(() => contentOf(path.join(gamma, created)))
      .toMatch(new RegExp(`^# ${literally(created.replace(/\.md$/, ''))}\\n`));

    // Renamed in place.
    await fromMenuOf(page, created, 'Rename');
    const newName = page.getByRole('textbox', { name: `New name for ${created}` });
    await newName.fill(renamed);
    await newName.press('Enter');
    await expect(rowOf(page, renamed)).toBeVisible();
    await expect(rowOf(page, created)).toHaveCount(0);
    expect(fs.existsSync(path.join(gamma, renamed))).toBe(true);

    // Deleted: the local history keeps it, so nothing is asked — a notification says so (07 · B-58).
    await fromMenuOf(page, renamed, 'Delete');
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: expected.keptNotice.replace('{{name}}', renamed) }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(rowOf(page, renamed)).toHaveCount(0);
    expect(fs.existsSync(path.join(gamma, renamed))).toBe(false);

    // The three facts, as the Audit screen says them.
    await page.goto('/audit');
    await expect(fileFact(page, expected.acts.created, created)).toBeVisible();
    await expect(fileFact(page, expected.acts.moved, created)).toBeVisible();
    await expect(fileFact(page, expected.acts.deleted, renamed)).toBeVisible();
  });

  test(`${core.id} — a folder with something in it deleted through the dialog that counts it (S-282)`, async ({
    page,
  }) => {
    const gamma = folderWith(suite.tree().gamma, {
      'box/one.txt': '1\n',
      'box/two.txt': '2\n',
      'box/inner/three.txt': '3\n',
      'stay.txt': 'stay\n',
    });
    // A file past what the local history keeps: the folder cannot be kept, so its delete is for good
    // and asks — the two steps of D-06 (07 · D-24). Sparse, so it costs no disk.
    fs.truncateSync(path.join(gamma, 'box/one.txt'), (await historyCeiling()) + 1);
    await suite.openTab(gamma);
    await openSignedIn(page, core.user, workbenchAddress(gamma));
    await expect(rowOf(page, 'box')).toBeVisible();

    await fromMenuOf(page, 'box', 'Delete');
    const first = page.getByRole('dialog', { name: 'Delete box for good?' });
    await expect(
      first
        .getByRole('list', { name: 'What will be deleted' })
        .getByText(expected.notKeptBecause.replace('{{path}}', 'box')),
    ).toBeVisible();
    await expect(first.getByRole('button', { name: 'Keep them' })).toBeFocused();
    await first.getByRole('button', { name: 'Delete for good' }).click();

    // The second step: how much goes with it, as the server counted it — the way out focused again.
    const counted = page.getByRole('dialog', { name: 'These hold more than themselves' });
    await expect(
      counted
        .getByRole('list', { name: 'What goes with it' })
        .getByText('box holds 4 entries, and all of them go too.'),
    ).toBeVisible();
    await expect(counted.getByRole('button', { name: 'Keep them' })).toBeFocused();
    expect(fs.existsSync(path.join(gamma, 'box'))).toBe(true);

    await counted.getByRole('button', { name: 'Delete for good' }).click();
    await expect(counted).toBeHidden();
    await expect(rowOf(page, 'box')).toHaveCount(0);
    expect(fs.existsSync(path.join(gamma, 'box'))).toBe(false);
    expect(fs.readFileSync(path.join(gamma, 'stay.txt'), 'utf8')).toBe('stay\n');
  });
});

test.describe('B-44 — the scripted Claude in the same file', () => {
  test(`${core.id} — Claude writes the open, clean file: the editor reloads it (S-283)`, async ({
    page,
  }) => {
    const gamma = folderWith(suite.tree().gamma, { [expected.claudeFile]: expected.before });
    await claudeBeside(page, side, gamma, expected.claudeFile, expected.before.trim());

    await claudeWrites(page);

    expect(fs.readFileSync(path.join(gamma, expected.claudeFile), 'utf8')).toBe(
      expected.claudeWrote,
    );
    await expect(linesOf(page).first()).toContainText(expected.claudeWrote.trim());
    await expect(page.getByText(expected.changedByClaude)).toHaveCount(0);
    await expect(cleanTab(page, expected.claudeFile)).toBeVisible();
  });

  test(`${core.id} — Claude writes the open, dirty file: saving meets the conflict, compared, overwritten (S-284); undoing Claude's turn keeps the human edit (S-285)`, async ({
    page,
  }) => {
    const gamma = folderWith(suite.tree().gamma, { [expected.claudeFile]: expected.before });
    const file = path.join(gamma, expected.claudeFile);
    const mine = `${expected.before}mine`;
    const sessionId = await claudeBeside(
      page,
      side,
      gamma,
      expected.claudeFile,
      expected.before.trim(),
    );

    await typeAtEnd(page, expected.claudeFile, 'mine');
    await claudeWrites(page);
    expect(fs.readFileSync(file, 'utf8')).toBe(expected.claudeWrote);

    // The buffer stays as typed, and the editor says who changed the disk under it.
    await expect(page.getByText(expected.changedByClaude)).toBeVisible();
    await expect(linesOf(page).first()).toContainText('mine');

    // Saving names the version that was opened: refused, with the three ways out (FILE_CHANGED).
    await editorOf(page, expected.claudeFile).focus();
    await page.keyboard.press('Control+S');
    const conflict = page.getByRole('dialog', { name: expected.conflictTitle });
    await expect(conflict.getByRole('button', { name: 'Compare' })).toBeFocused();
    expect(fs.readFileSync(file, 'utf8')).toBe(expected.claudeWrote);

    // Compare: the disk beside the buffer, in a tab of its own.
    await conflict.getByRole('button', { name: 'Compare' }).click();
    await expect(conflict).toBeHidden();
    await expect(editorTab(page, 1, new RegExp(`^${literally(expected.diffTab)}`))).toBeVisible();
    await expect(page.locator('.monaco-diff-editor').first()).toContainText(
      expected.claudeWrote.trim(),
    );

    // Back on the file, the question waits above it — and overwriting is on purpose.
    await editorTab(
      page,
      1,
      new RegExp(`^${literally(expected.claudeFile)}, Unsaved changes`),
    ).click();
    await page.getByRole('button', { name: 'Decide…' }).click();
    await page
      .getByRole('dialog', { name: expected.conflictTitle })
      .getByRole('button', { name: 'Overwrite the file on disk' })
      .click();
    await expect.poll(() => fs.readFileSync(file, 'utf8')).toBe(mine);
    await expect(cleanTab(page, expected.claudeFile)).toBeVisible();

    // S-285 — undoing Claude's turn finds the file changed outside the session, and keeps it: the
    // screen says so before anything is touched, and offers nothing that would do nothing.
    const confirmation = await confirmationOfTheOnlyPoint(page);
    const kept = confirmation.getByRole('list', { name: 'Stay as they are' });
    await expect(kept.getByText(file)).toBeVisible();
    await expect(kept.getByText(expected.keptBecause)).toBeVisible();
    await expect(confirmation.getByText(expected.nothingToUndo)).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Undo these files' })).toBeDisabled();

    // Asked anyway — from another device, an older screen — the undo leaves the human edit, and
    // every screen watching the session is told so, file by file.
    const outcome = await undoFromElsewhere(sessionId);
    expect(outcome).toMatchObject({
      reverted: [],
      preserved: [{ path: file, reason: 'modifiedOutside' }],
      failed: [],
    });
    const report = lastUndoReport(page);
    await expect(
      report.getByRole('list', { name: 'Kept as they were' }).getByText(file),
    ).toBeVisible();
    expect(fs.readFileSync(file, 'utf8')).toBe(mine);
    await expect(linesOf(page).first()).toContainText('mine');
  });
});

test.describe('B-45 — folder tabs, groups, the phone and accessibility', () => {
  test(`${core.id} — two folder tabs, a folder and its subfolder: switched without losing state, one closed without the other, a reload restores (S-286)`, async ({
    page,
  }) => {
    const tree = suite.tree();
    const alpha = folderWith(tree.alpha, { 'a.txt': 'alpha a\n', 'c.txt': 'alpha c\n' });
    const beta = folderWith(tree.beta, { 'b.txt': 'beta b\n' });
    await suite.openTab(alpha);
    await suite.openTab(beta);

    await openSignedIn(page, core.user, fileAddress(alpha, 'c.txt'));
    await monacoShows(page, 'c.txt', 'alpha c');
    await rowOf(page, 'a.txt').dblclick();
    await monacoShows(page, 'a.txt', 'alpha a');
    await rowOf(page, 'beta').click();
    await expect(rowOf(page, 'beta')).toHaveAttribute('aria-expanded', 'true');
    await typeAtEnd(page, 'a.txt', 'unsaved');
    await expect(editorTab(page, 1, /^a\.txt, Unsaved changes/)).toBeVisible();

    // The subfolder's tab is a tab of its own: its tree, its editor.
    await tabOf(page, 'beta').click();
    await page.waitForURL(onWorkbenchOf(beta));
    await rowOf(page, 'b.txt').dblclick();
    await monacoShows(page, 'b.txt', 'beta b');
    await expect(editorTab(page, 1, /^a\.txt/)).toHaveCount(0);

    // Back: everything as it was left, the unsaved text included.
    await tabOf(page, 'alpha').click();
    await page.waitForURL(onWorkbenchOf(alpha));
    await expect(editorTab(page, 1, /^a\.txt, Unsaved changes/)).toBeVisible();
    await expect(editorTab(page, 1, /^c\.txt/)).toBeVisible();
    await expect(linesOf(page).first()).toContainText('unsaved');
    await expect(rowOf(page, 'beta')).toHaveAttribute('aria-expanded', 'true');

    // Closing the subfolder's tab leaves this one alone.
    await tabStrip(page).getByRole('button', { name: 'Close beta' }).click();
    await page
      .getByRole('dialog', { name: 'Close beta?' })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(tabOf(page, 'beta')).toBeHidden();
    await expect(tabOf(page, 'alpha')).toHaveAttribute('aria-current', 'page');
    await expect(editorTab(page, 1, /^a\.txt, Unsaved changes/)).toBeVisible();
    expect(await tabsOf(suite.user())).toEqual([alpha]);

    // Saved, then reloaded: the tab, its editor tabs and its open folders come back.
    await editorOf(page, 'a.txt').focus();
    await savedAs(page, path.join(alpha, 'a.txt'), 'alpha a\nunsaved');
    await page.reload();
    await page.waitForURL(onWorkbenchOf(alpha));
    await expect(tabOf(page, 'alpha')).toHaveAttribute('aria-current', 'page');
    await expect(tabOf(page, 'beta')).toBeHidden();
    await expect(editorTab(page, 1, /^a\.txt$/)).toBeVisible();
    await expect(editorTab(page, 1, /^c\.txt$/)).toBeVisible();
    await monacoShows(page, 'a.txt', 'alpha a');
    await expect(rowOf(page, 'beta')).toHaveAttribute('aria-expanded', 'true');
    await expect(rowOf(page, 'b.txt')).toBeVisible();
  });

  test(`${core.id} — two groups side by side with the same file: one buffer, edited in both (S-287)`, async ({
    page,
  }) => {
    const gamma = folderWith(suite.tree().gamma, { 'both.txt': 'shared\n' });
    const file = path.join(gamma, 'both.txt');
    await suite.openTab(gamma);
    await openSignedIn(page, core.user, fileAddress(gamma, 'both.txt'));
    await monacoShows(page, 'both.txt', 'shared');

    await page.getByRole('button', { name: 'Open to the side' }).first().click();
    await expect(editorTab(page, 2, /^both\.txt/)).toBeVisible();
    await expect(editorTab(page, 1, /^both\.txt/)).toBeVisible();
    await expect(editorOf(page, 'both.txt')).toHaveCount(2);
    await expect(linesOf(page)).toHaveCount(2);

    // Side by side, not one over the other.
    const left = await page.getByRole('region', { name: 'Group 1' }).boundingBox();
    const right = await page.getByRole('region', { name: 'Group 2' }).boundingBox();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(right?.x ?? 0).toBeGreaterThanOrEqual((left?.x ?? 0) + (left?.width ?? 0) - 1);

    // Typed in the second group, shown in the first: the same buffer.
    await typeAtEnd(page, 'both.txt', 'from group two', 1);
    await expect(linesOf(page).nth(0)).toContainText('from group two');
    await expect(editorTab(page, 1, /^both\.txt, Unsaved changes/)).toBeVisible();
    await savedAs(page, file, 'shared\nfrom group two');
    await expect(editorTab(page, 1, /^both\.txt$/)).toBeVisible();
    await expect(editorTab(page, 2, /^both\.txt$/)).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: expected.phone, isMobile: true, hasTouch: true });

    test(`${core.id} — a phone gets the simplified editor and never scrolls sideways (S-288)`, async ({
      page,
    }) => {
      const gamma = folderWith(suite.tree().gamma, {
        'phone.txt': `short\n${'a long line that does not fit on a phone screen '.repeat(6)}\n`,
      });
      const file = path.join(gamma, 'phone.txt');
      const original = fs.readFileSync(file, 'utf8');
      await suite.openTab(gamma);
      await openSignedIn(page, core.user, fileAddress(gamma, 'phone.txt'));

      const bar = page.getByRole('navigation', { name: 'Views of this folder' });
      await bar.getByRole('button', { name: 'Explorer' }).click();
      await expect(rowOf(page, 'phone.txt')).toBeVisible();
      expect(await scrollsSideways(page)).toBe(false);

      await bar.getByRole('button', { name: 'Editor' }).click();
      const area = editorOf(page, 'phone.txt');
      await expect(area).toBeVisible();
      await expect(area).toHaveValue(original);
      expect(await area.evaluate((element) => element.tagName)).toBe('TEXTAREA');
      await expect(page.locator('.monaco-editor')).toHaveCount(0);
      expect(await scrollsSideways(page), (await widerThanThePage(page)).join('\n')).toBe(false);

      await area.focus();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('typed on the phone');
      await savedAs(page, file, `${original}typed on the phone`);
      expect(await scrollsSideways(page)).toBe(false);
    });
  });

  for (const theme of expected.themes) {
    test(`${core.id} — axe finds no violation on the explorer and the editor (S-289, ${theme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const gamma = folderWith(suite.tree().gamma, {
        'shown.ts': 'export const shown = 1;\n',
        'other.md': '# other\n',
        'nested/inner.txt': 'inner\n',
      });
      await suite.openTab(gamma);
      await openSignedIn(page, core.user, fileAddress(gamma, 'shown.ts'));
      await monacoShows(page, 'shown.ts', 'export const shown');
      await rowOf(page, 'nested').click();
      await expect(rowOf(page, 'inner.txt')).toBeVisible();
      expect(await violationsOn(page, expected.tags), 'the explorer and the editor').toEqual([]);

      await rowOf(page, 'other.md').click({ button: 'right' });
      await expect(page.getByRole('menu', { name: 'File actions' })).toBeVisible();
      expect(await violationsOn(page, expected.tags), 'the context menu of the explorer').toEqual(
        [],
      );
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu', { name: 'File actions' })).toHaveCount(0);

      await typeAtEnd(page, 'shown.ts', '// dirty');
      await expect(editorTab(page, 1, /^shown\.ts, Unsaved changes/)).toBeVisible();
      expect(await violationsOn(page, expected.tags), 'the editor with unsaved changes').toEqual(
        [],
      );
    });
  }

  test(`${core.id} — a link whose file climbs out of the folder is refused, in words (S-290)`, async ({
    page,
  }) => {
    const gamma = folderWith(suite.tree().gamma, { 'inside.txt': 'inside\n' });
    await suite.openTab(gamma);
    await openSignedIn(page, core.user, fileAddress(gamma, expected.climbing));

    // Named by where the link really leads — the folder's parent — and refused by the fence.
    const target = path.resolve(gamma, expected.climbing);
    const refusal = page
      .getByRole('alert')
      .filter({ hasText: expected.refusedTitle.replace('{{path}}', target) });
    await expect(refusal).toBeVisible();
    await expect(
      refusal.getByText(`${expected.refused} ${target}.`, { exact: true }),
    ).toBeVisible();
    await expect(refusal.getByText(/^Trace /)).toBeVisible();
    await expect(page.locator('.monaco-editor')).toHaveCount(0);

    // The folder itself carries on: its tree is there.
    await expect(rowOf(page, 'inside.txt')).toBeVisible();
  });
});
