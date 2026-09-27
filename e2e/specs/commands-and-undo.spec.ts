import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { callApi } from '../fixtures/api';
import { scratchFolders, send, sessionScreen, startConversation } from '../fixtures/history';
import { closeSession, connected, workspaceFor } from '../fixtures/live-session';
import type { E2eSocket } from '../fixtures/ws';
import { scenario } from '../scenarios';

/**
 * The slash commands of the installation and the undo, through the screen — plan 04, F5 (B-24).
 *
 * The scripted backend writes the files a recording wrote, in the directory the session runs in,
 * so what these assert about the disk is what the product did to it. Each test works in a folder of
 * its own inside the allowlist, gone after it.
 *
 * The permission deadline of this stack is five seconds, and nothing here waits on it: every
 * question is answered on the card as soon as it appears.
 */

const init = scenario('commands-init');
const undone = scenario('undo-files');
const locked = scenario('undo-during-turn');

const context = workspaceFor(init.user);
const scratch = scratchFolders();

/** A session on a folder of its own, open in the browser, and the socket that owns it. */
async function onScreen(
  page: Page,
  workspace: string,
): Promise<{ socket: E2eSocket; sessionId: string }> {
  const socket = await connected(context().user);
  const { sessionId } = await startConversation(socket, workspace);
  await sessionScreen(page, init.user, sessionId);

  return { socket, sessionId };
}

/** The question on screen about one tool. */
function cardFor(page: Page, toolName: string): ReturnType<Page['getByRole']> {
  return page.getByRole('listitem', { name: `Permission for ${toolName}` });
}

/** The status the screen shows for a session with nothing running. */
function idle(page: Page): ReturnType<Page['getByText']> {
  return page.getByText('Idle', { exact: true });
}

/** Waits for the first turn to end, as the screen says it: its cost, and the session idle again. */
async function firstTurnEnded(page: Page): Promise<void> {
  await expect(page.getByText(/^Last turn cost/)).toBeVisible();
  await expect(idle(page)).toBeVisible();
}

/** Sends the recorded turn that writes a file, and allows the write on its card. */
async function writingTurn(page: Page, fixture: string): Promise<void> {
  await send(page, `do the work [fixture:${fixture}]`);
  await cardFor(page, 'Write').getByRole('button', { name: 'Allow once' }).click();
  await firstTurnEnded(page);
}

/** Opens the undo panel and the confirmation of its only point. */
async function confirmationOfTheOnlyPoint(page: Page): Promise<ReturnType<Page['getByRole']>> {
  await page.getByRole('button', { name: 'Undo file changes' }).click();
  await page
    .getByRole('list', { name: 'Undo points' })
    .getByRole('button', { name: /do the work/ })
    .click();

  return page.getByRole('group', { name: 'Undo these file changes?' });
}

test(`${init.id} — ${init.title}`, async ({ page }) => {
  const expected = init.expect as {
    fixture: string;
    command: string;
    toolName: string;
    refused: string;
    file: string;
  };
  const workspace = scratch(context().workspace);
  fs.writeFileSync(path.join(workspace, 'README.md'), '# tally\n\nCounts words.\n');
  const { socket, sessionId } = await onScreen(page, workspace);

  try {
    // Picked from the menu of this installation, which writes it into the box and sends nothing.
    await page.getByRole('button', { name: 'Commands' }).click();
    await page
      .getByRole('list', { name: 'Suggested' })
      .getByRole('button', { name: new RegExp(`^${expected.command}\\b`) })
      .click();

    const box = page.getByLabel('Prompt');
    await expect(box).toHaveValue(`${expected.command} `);

    // The argument a person would add. This one is read by the scripted backend alone: it names
    // the recording of a real `/init` to replay.
    await box.press('End');
    await box.pressSequentially(`[fixture:${expected.fixture}]`);
    await page.getByRole('button', { name: 'Send' }).click();

    // The recorded `/init` asks twice — a shell command, then the write. The shell command is
    // refused, as a cautious person would; the write goes through the same card as any other.
    await cardFor(page, expected.refused).getByRole('button', { name: 'Refuse' }).click();
    await cardFor(page, expected.toolName).getByRole('button', { name: 'Allow once' }).click();
    await firstTurnEnded(page);

    const written = fs.readFileSync(path.join(workspace, expected.file), 'utf8');
    expect(written.startsWith(`# ${expected.file}`)).toBe(true);
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${undone.id} — ${undone.title}`, async ({ page }) => {
  const expected = undone.expect as { fixture: string; file: string; before: string };
  const workspace = scratch(context().workspace);
  const file = path.join(workspace, expected.file);
  fs.writeFileSync(file, expected.before);
  const { socket, sessionId } = await onScreen(page, workspace);

  try {
    await writingTurn(page, expected.fixture);
    expect(fs.readFileSync(file, 'utf8')).not.toBe(expected.before);

    // The reach before anything is touched: this file, going back.
    const confirmation = await confirmationOfTheOnlyPoint(page);
    await expect(
      confirmation.getByRole('list', { name: 'Go back to how they were' }).getByText(file),
    ).toBeVisible();

    await confirmation.getByRole('button', { name: 'Undo these files' }).click();

    // And the outcome, file by file — then the disk itself.
    const report = page.getByRole('region', { name: 'Last undo' });
    await expect(report.getByRole('list', { name: 'Put back' }).getByText(file)).toBeVisible();
    expect(fs.readFileSync(file, 'utf8')).toBe(expected.before);
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${locked.id} — ${locked.title}`, async ({ page }) => {
  const expected = locked.expect as {
    fixture: string;
    held: string;
    file: string;
    code: string;
    busy: string;
  };
  const workspace = scratch(context().workspace);
  const file = path.join(workspace, expected.file);
  const { socket, sessionId } = await onScreen(page, workspace);

  try {
    await writingTurn(page, expected.fixture);
    const written = fs.readFileSync(file, 'utf8');

    // A turn that runs until somebody stops it — from the outside, a tool that takes minutes.
    await send(page, `hold on [fixture:${expected.held}] [hold]`);
    await expect(idle(page)).toBeHidden();

    // The screen says why, and offers nothing to press.
    const confirmation = await confirmationOfTheOnlyPoint(page);
    await expect(page.getByText(expected.busy)).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Undo these files' })).toBeDisabled();

    // And the server refuses it too, for whoever asks anyway — another device, an older screen.
    const { checkpoints } = (await (
      await callApi(context().user, `/sessions/${sessionId}/checkpoints`)
    ).json()) as { checkpoints: { promptId: string }[] };
    const mark = socket.frames.length;
    socket.send('session.rewindFiles', { sessionId, promptId: checkpoints[0]?.promptId ?? '' });

    const refusal = await socket.waitFor(
      (frame) => socket.frames.indexOf(frame) >= mark && frame.kind === 'error',
    );
    expect(refusal.payload).toMatchObject({
      code: expected.code,
      messageKey: 'session.error.locked',
    });
    expect(fs.readFileSync(file, 'utf8')).toBe(written);

    // Once the turn stops, the undo is offered again.
    await page.getByRole('button', { name: 'Interrupt' }).click();
    await expect(idle(page)).toBeVisible();
    await expect(page.getByText(expected.busy)).toBeHidden();
    await expect(confirmation.getByRole('button', { name: 'Undo these files' })).toBeEnabled();
  } finally {
    await closeSession(socket, sessionId);
  }
});
