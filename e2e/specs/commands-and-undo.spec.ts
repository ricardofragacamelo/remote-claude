import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { callApi } from '../fixtures/api';
import {
  allowOnce,
  cardFor,
  commandsToggle,
  confirmationOfTheOnlyPoint,
  idleStatus,
  interruptButton,
  lastUndoReport,
  promptBox,
  refuse,
  send,
  sendButton,
  suggestedCommand,
  turnsEnded,
} from '../fixtures/claude-panel';
import { scratchFolders } from '../fixtures/history';
import { attachFrom, closeSession, connected, workspaceFor } from '../fixtures/live-session';
import { closeTab, sessionInTab } from '../fixtures/workbench';
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
 *
 * The session is opened where a person opens it now — in the tab of its folder, from the chat beside
 * the editor — and a socket of the suite attaches to it for what only a socket does (plan 06, B-33).
 */

const init = scenario('commands-init');
const undone = scenario('undo-files');
const locked = scenario('undo-during-turn');

const context = workspaceFor(init.user);
const scratch = scratchFolders();

/** A session started in the tab of a folder of its own, and a socket of the suite attached to it. */
async function onScreen(
  page: Page,
  workspace: string,
): Promise<{ socket: E2eSocket; sessionId: string }> {
  const sessionId = await sessionInTab(page, init.user, workspace);
  const socket = await connected(context().user);
  await attachFrom(socket, sessionId, 0);

  return { socket, sessionId };
}

/** Ends what a test opened: the session, and the folder tab it was born in. */
async function cleanUp(socket: E2eSocket, sessionId: string, workspace: string): Promise<void> {
  await closeSession(socket, sessionId);
  await closeTab(context().user, workspace);
}

/**
 * Waits for the first turn of the test to end — the one after the opening — as the screen says it:
 * what the session has cost over both, and the session idle again.
 */
async function firstTurnEnded(page: Page): Promise<void> {
  await expect(turnsEnded(page, 2)).toBeVisible();
  await expect(idleStatus(page)).toBeVisible();
}

/** Sends the recorded turn that writes a file, and allows the write on its card. */
async function writingTurn(page: Page, fixture: string): Promise<void> {
  await send(page, `do the work [fixture:${fixture}]`);
  await allowOnce(cardFor(page, 'Write')).click();
  await firstTurnEnded(page);
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
    // Picked from the list of `/` of this installation, which writes it into the box and sends
    // nothing (plan 09, B-12: the `/` of the bar opens it).
    await commandsToggle(page).click();
    await suggestedCommand(page, expected.command).click();

    const box = promptBox(page);
    await expect(box).toHaveValue(`${expected.command} `);

    // The argument a person would add. This one is read by the scripted backend alone: it names
    // the recording of a real `/init` to replay.
    await box.press('End');
    await box.pressSequentially(`[fixture:${expected.fixture}]`);
    await sendButton(page).click();

    // The recorded `/init` asks twice — a shell command, then the write. The shell command is
    // refused, as a cautious person would; the write goes through the same card as any other.
    await refuse(cardFor(page, expected.refused)).click();
    await allowOnce(cardFor(page, expected.toolName)).click();
    await firstTurnEnded(page);

    const written = fs.readFileSync(path.join(workspace, expected.file), 'utf8');
    expect(written.startsWith(`# ${expected.file}`)).toBe(true);
  } finally {
    await cleanUp(socket, sessionId, workspace);
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
    const report = lastUndoReport(page);
    await expect(report.getByRole('list', { name: 'Put back' }).getByText(file)).toBeVisible();
    expect(fs.readFileSync(file, 'utf8')).toBe(expected.before);
  } finally {
    await cleanUp(socket, sessionId, workspace);
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
    await expect(idleStatus(page)).toBeHidden();

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

    // Once the turn stops, the undo is offered again — the dialog closed, stop pressed, and the
    // dialog opened anew (plan 09, B-17: the undo is a dialog of the menu of the session).
    await page.keyboard.press('Escape');
    await interruptButton(page).click();
    await expect(idleStatus(page)).toBeVisible();
    const again = await confirmationOfTheOnlyPoint(page);
    await expect(page.getByText(expected.busy)).toBeHidden();
    await expect(again.getByRole('button', { name: 'Undo these files' })).toBeEnabled();
  } finally {
    await cleanUp(socket, sessionId, workspace);
  }
});
