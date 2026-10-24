import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { callApi } from '../fixtures/api';
import { openSignedIn } from '../fixtures/auth';
import type { AuthenticatedUser } from '../fixtures/auth';
import { connectedStatus, modelChip } from '../fixtures/claude-panel';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { closeSession, connected } from '../fixtures/live-session';
import { openFromDraft, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The agent settings screen, through the door a person uses — plan 13, F4, B-41.
 *
 * The core's own section of every engine's settings — "Models and defaults" — and Claude's own
 * "Installation": a default changed there is what a session opens with next (S-185), a folder's own
 * default wins over the user's (B-14's order of precedence, proved from the screen rather than from
 * the domain alone), and the diagnostic of the installation together with the test of the connection
 * to the model describe what they found (S-186).
 *
 * The Agent SDK behind this stack is the scripted replay every end-to-end spec shares
 * (`RC_E2E_FIXTURE`, never overridden — `backend/test/e2e/scripted-main.ts`): the account, the
 * installation and the test of the connection all answer from the same recorded fixtures regardless
 * of which turn is replayed, which is what makes them safe to assert on here without a fixture of
 * this spec's own.
 */

const settings = scenario('claude-settings');
const expected = settings.expect as {
  userDefault: {
    model: string;
    displayName: string;
    permissionMode: string;
    formModeLabel: string;
  };
  folderDefault: {
    model: string;
    displayName: string;
    permissionMode: string;
    formModeLabel: string;
  };
  loginReady: string;
  checkResult: string;
  checkModel: string;
  checkCost: string;
};

// Wide enough for the model chip to sit directly in the bar, never behind "More choices" — the
// same width plan 28's engine-neutral panel spec uses for the engine chip, for the same reason.
test.use({ viewport: { width: 1920, height: 1080 } });

const suite = workbenchSuite(settings.user);
const opened = sessionsOpened(suite.user);

/** The address of the agent settings screen, for Claude, with the section and the folder of a test. */
function settingsAddress(section: string, folder?: string): string {
  const search = new URLSearchParams({ section });
  if (folder !== undefined) {
    search.set('folder', folder);
  }
  return `/settings/agents/claude?${search.toString()}`;
}

/** The form of one scope of defaults — "Your default" or "The default of …" — by its heading. */
function formOf(page: Page, heading: string): Locator {
  return page.getByRole('form', { name: heading, exact: true });
}

/**
 * The `<select>` of one field of a defaults form, found by the field's own label.
 *
 * Not `getByLabel`: the field wraps its `<select>` directly in a `<label>` (`Field`, in
 * `DefaultsForm.tsx`), and Chromium's accessible name for that control folds in the text of
 * whichever `<option>` is currently selected — so the name the browser reports is "Model" only
 * while nothing is chosen yet, and becomes "ModelThe installation's default" the moment a value is
 * selected, which breaks an exact match on "Model" alone. The label's own leading text never
 * changes, so anchoring on where it **starts** finds the field whatever is selected.
 */
function fieldSelect(form: Locator, labelStart: string): Locator {
  return form.locator('label', { hasText: new RegExp(`^${labelStart}`) }).locator('select');
}

/** Picks a model and a mode in a defaults form, through its own controls, and saves. */
async function chooseDefaults(form: Locator, model: string, modeLabel: string): Promise<void> {
  await fieldSelect(form, 'Model').selectOption({ label: model });
  await fieldSelect(form, 'Permission mode').selectOption({ label: modeLabel });
  await form.getByRole('button', { name: 'Save', exact: true }).click();
}

/** Resets the test's own defaults — never leaves the shared user changed for the suite after it. */
async function resetDefaults(user: AuthenticatedUser, folder: string): Promise<void> {
  await callApi(user, '/engines/claude/defaults', {
    method: 'PUT',
    body: { model: null, permissionMode: null, effort: null, thinking: null, fallbackModel: null },
  });

  const response = await callApi(
    user,
    `/engines/claude/defaults/folder?${new URLSearchParams({ folder }).toString()}`,
    { method: 'DELETE' },
  );
  expect([204, 404]).toContain(response.status);
}

/** Opens a session on `workspacePath` from a plain socket, and answers what `session.started` said. */
async function startedWith(
  workspacePath: string,
): Promise<{ sessionId: string; model: string; permissionMode: string; defaultsFrom: string }> {
  const socket = await connected(suite.user());
  socket.send('session.start', { workspacePath });
  const started = await socket.waitFor((frame) => frame.type === 'session.started');
  const payload = started.payload as {
    sessionId: string;
    model: string;
    permissionMode: string;
    defaultsFrom: string;
  };

  await closeSession(socket, payload.sessionId);
  return payload;
}

/** Opens a session in `folder` from the panel's own draft, and answers its id. */
async function openedFromPanel(page: Page, folder: string): Promise<string> {
  await page.goto(workbenchAddress(folder));
  await expect(connectedStatus(page)).toBeVisible();
  const sessionId = await openFromDraft(page);
  opened(sessionId);

  return sessionId;
}

test(`${settings.id} — a default changed on the screen reaches the session it opens, and a folder's wins over the user's (S-185)`, async ({
  page,
}) => {
  const tree = suite.tree();

  try {
    await openSignedIn(page, settings.user, settingsAddress('models'));

    // The user's own default, every folder: picked on the screen, saved, and in force once it is.
    const forUser = formOf(page, 'Your default — every folder');
    await chooseDefaults(
      forUser,
      expected.userDefault.displayName,
      expected.userDefault.formModeLabel,
    );
    await expect(forUser.getByText(`In force: ${expected.userDefault.displayName}`)).toBeVisible();

    // `session.started` of a session with no folder override: the user's own default.
    const plain = await startedWith(tree.alpha);
    expect(plain.model).toBe(expected.userDefault.model);
    expect(plain.permissionMode).toBe(expected.userDefault.permissionMode);
    expect(plain.defaultsFrom).toBe('user');

    // The panel's own indicator, opened from the draft, says the same default model. The mode is
    // the draft's own choice, not the installation's or a folder's (plan 08, D-07) — its composer
    // always sends one, "Ask me" the first time, so only `session.started` (above) is where this
    // plan's own mode default is provable.
    await openedFromPanel(page, tree.alpha);
    await expect(modelChip(page, expected.userDefault.displayName)).toBeVisible();

    // The folder's own default, for one folder and its subfolders: wins over the user's.
    await page.goto(settingsAddress('models', tree.gamma));
    const forFolder = formOf(page, `The default of ${tree.gamma} and its subfolders`);
    await chooseDefaults(
      forFolder,
      expected.folderDefault.displayName,
      expected.folderDefault.formModeLabel,
    );
    await expect(
      forFolder.getByText(`In force: ${expected.folderDefault.displayName}`),
    ).toBeVisible();

    // `session.started` of a session in that folder: the folder's default, not the user's.
    const overridden = await startedWith(tree.gamma);
    expect(overridden.model).toBe(expected.folderDefault.model);
    expect(overridden.permissionMode).toBe(expected.folderDefault.permissionMode);
    expect(overridden.defaultsFrom).toBe('folder');

    // The panel, in that folder, shows the folder's default model — not the user's.
    await openedFromPanel(page, tree.gamma);
    await expect(modelChip(page, expected.folderDefault.displayName)).toBeVisible();
  } finally {
    await resetDefaults(suite.user(), tree.gamma);
  }
});

test(`${settings.id} — the installation's diagnostic and the test of the connection, with the result described (S-186)`, async ({
  page,
}) => {
  await openSignedIn(page, settings.user, settingsAddress('account'));

  // The account: read from the installation, the state this Claude signed in with.
  await expect(page.getByText('person@example.com')).toBeVisible();

  // The installation's diagnostic: why Claude does or does not work here.
  await page.getByRole('button', { name: 'Installation', exact: true }).click();
  const login = page.getByText('Login', { exact: true }).locator('xpath=following-sibling::dd[1]');
  await expect(login).toHaveText(expected.loginReady);

  // The test of the connection: the model answered, and the result is described, not just "ok".
  await page.getByRole('button', { name: 'Test the connection', exact: true }).click();
  const outcome = page.getByRole('status');
  await expect(outcome).toContainText(expected.checkResult);
  await expect(outcome).toContainText(`Model: ${expected.checkModel}`);
  await expect(outcome).toContainText(`US$ ${expected.checkCost}`);
});
