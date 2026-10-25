import path from 'node:path';
import fs from 'node:fs';

import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { environment } from '../fixtures/environment';
import { settingsAddress } from '../fixtures/agent-settings';
import { commandsToggle, promptBox, suggestedCommand } from '../fixtures/claude-panel';
import { callApi } from '../fixtures/api';
import { openSignedIn } from '../fixtures/auth';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { openFromDraft, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * A project's own configuration, through the door a person uses — plan 13, F4, B-44.
 *
 * Three things this phase's earlier specs never touched: a slash command born from the web's own
 * template rather than typed by hand (B-33), a folder the allowlist refuses before the screen ever
 * asks the installation anything (B-31, S-142's own refusal, now proved from the screen), and a
 * skill of the user's own, badged by its origin (B-34, B-35).
 *
 * The third one runs into a real limit of the scripted Agent SDK every other spec of this phase
 * shares: `supportedCommands()` and `reloadSkills()` answer the **same recorded list for the whole
 * run**, never anything composed from `Options.plugins` or `Options.skills`
 * (`backend/test/fakes/agent-sdk/scripted-query.ts` reads neither) — recording a different list
 * needs a real Claude CLI this environment has no credential for (`pnpm fixtures:record`), the same
 * way `release-notes` (the project skill every recorded fixture already carries) got onto the
 * canned list in the first place. So the badge is proved genuinely, off the real
 * `SyntheticSkillsPluginBuilder`/`ClaudeSkillSourcesReader` reading a fixture skill straight from
 * disk — no SDK involved — and the origin switch's "applies at once" promise is proved on the same
 * screen's own state, which is exactly what decides whether a session's `Options.skills` would carry
 * it. The live panel's own `/` reacting to that is already proved at integration level (S-156) and is
 * `smoke-live`'s job against the real CLI (S-197) — see decisions.md, D-126.
 */

const setup = scenario('claude-settings-project');
const expected = setup.expect as {
  commandName: string;
  command: string;
  refused: string;
  userSkillName: string;
};

test.use({ viewport: { width: 1920, height: 1080 } });

const suite = workbenchSuite(setup.user);
const opened = sessionsOpened(suite.user);

/** The `<select>` of the folder picker every section of the screen opens with (plan 13, B-16). */
function folderPickerSelect(page: Page): Locator {
  return page.locator('label', { hasText: /^Folder/ }).locator('select');
}

/** The directory a fixture user skill of this spec's own lives in, under this run's own config dir. */
function userSkillDir(name: string): string {
  return path.join(environment.claudeConfigDir, 'skills', name);
}

/**
 * The "State" cell of a skill's own row — never `row.getByText('Off'/'On', { exact: true })`: a
 * skill a declared hook keeps out (this spec's own fixture) shares that same cell with the reason
 * why, as a second, separate paragraph (`SkillTable.tsx`), so the cell's whole text is never
 * exactly "Off" or "On" alone.
 */
function stateCell(row: Locator): Locator {
  return row.locator('td').nth(4);
}

/** Resets this user's own skill preferences to the safety default (D-20: nobody's skills load
 * until asked for) — what this test's own folder inherits from before it ever sets a folder-level
 * override of its own, on a folder {@link workbenchSuite} throws away and never reopens. */
async function resetSkillPreferences(): Promise<void> {
  const response = await callApi(suite.user(), '/engines/claude/skills/preferences', {
    method: 'PUT',
    body: { sources: {}, disabledSkills: [] },
  });
  expect(response.status).toBe(200);
}

test(`${setup.id} — a slash command written from the template reaches the panel's own menu (S-192)`, async ({
  page,
}) => {
  const tree = suite.tree();
  await openSignedIn(page, setup.user, settingsAddress('project', tree.alpha));

  await page.getByRole('button', { name: 'New command', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'New slash command' })).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill(expected.commandName);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();

  // Written by the plan 07 file endpoint, from the template — opened in the editor right after
  // (D-18): the content on screen is what the template put on disk, not a promise this screen made.
  await expect(page.locator('.monaco-editor .view-lines').first()).toContainText(
    `Describe what "${expected.command}" should do here`,
  );

  // The installation's own canned menu already carries this exact name — the same fixture
  // engineering `release-notes` got for the project's own commands and skills (see this file's own
  // header comment) — so using it from the panel proves the picker's own wiring, the one thing this
  // scenario is actually about.
  await page.goto(workbenchAddress(tree.alpha));
  const sessionId = await openFromDraft(page);
  opened(sessionId);

  await commandsToggle(page).click();
  await suggestedCommand(page, expected.command).click();
  await expect(promptBox(page)).toHaveValue(`${expected.command} `);
});

test(`${setup.id} — a folder outside the allowlist shows the translated refusal, with a way back (S-193)`, async ({
  page,
}) => {
  const tree = suite.tree();
  await openSignedIn(page, setup.user, settingsAddress('project', tree.outside));

  const refusal = page.getByText(`${expected.refused} ${tree.outside}.`, { exact: true });
  await expect(refusal).toBeVisible();

  // The way back: the folder picker never leaves with the error — choosing "none" clears it.
  await folderPickerSelect(page).selectOption('');
  await expect(refusal).toHaveCount(0);
  await expect(page.getByText('Choose a folder', { exact: true })).toBeVisible();
});

test(`${setup.id} — a fixture user skill shows its own badge, and turning the origin off applies at once (S-194)`, async ({
  page,
}) => {
  const tree = suite.tree();
  const skillDir = userSkillDir(expected.userSkillName);
  fs.rmSync(skillDir, { recursive: true, force: true });
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${expected.userSkillName}`,
      'description: A fixture user skill, for plan 13, B-44 (S-194).',
      'hooks: {}',
      '---',
      '',
      'A fixture skill whose declared hook keeps it out of the installation on purpose, so this row',
      'comes straight off disk — never off the scripted Agent SDK (decisions.md, D-126).',
      '',
    ].join('\n'),
  );

  // Defensive: a previous run interrupted mid-test would otherwise start from "on" (D-20's own
  // safety default is "off", so this also confirms the test starts from it).
  await resetSkillPreferences();

  try {
    await openSignedIn(page, setup.user, settingsAddress('skills', tree.alpha));
    const row = page.locator('tr').filter({ hasText: expected.userSkillName });

    await expect(row.getByText('User', { exact: true })).toBeVisible();
    await expect(
      row.getByText('Not loaded — it declares a hook, which never gets the chance to run', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(stateCell(row)).toContainText('Off');

    // Turning an origin on widens what a session may load, so it is confirmed first (D-20) — the
    // checkbox itself stays controlled by the saved preference, not by the click, so this is a
    // plain `.click()`: `.check()`'s own built-in "did the state change" assertion fails here,
    // because confirming (not the click) is what eventually flips it.
    await page.getByLabel('Your own skills', { exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Turn on User?' })
      .getByRole('button', { name: 'Turn on', exact: true })
      .click();
    await expect(stateCell(row)).toContainText('On');

    // Off again needs no question, and applies at once — the same asymmetry (D-20). Still a plain
    // `.click()`: the checkbox only reflects the saved preference once the write settles.
    await page.getByLabel('Your own skills', { exact: true }).click();
    await expect(stateCell(row)).toContainText('Off');
  } finally {
    fs.rmSync(skillDir, { recursive: true, force: true });
    await resetSkillPreferences();
  }
});
