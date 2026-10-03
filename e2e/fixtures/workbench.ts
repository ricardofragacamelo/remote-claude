import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { callApi } from './api';
import { openSignedIn } from './auth';
import type { AuthenticatedUser } from './auth';
import {
  connectedStatus,
  openedSessionOf,
  promptBox,
  sendButton,
  turnsEnded,
} from './claude-panel';
import { environment } from './environment';
import type { ScenarioUser } from '../scenarios';

/**
 * The workbench, from the outside — plan 06.
 *
 * A session is born where a person starts it now: in the tab of a folder, from the chat beside the
 * editor. The address of a session is gone ([06 · D-07](../../docs/plans/06-workbench/decisions.md)),
 * so the specs that used to open `/sessions/$id` start the session here, and a socket of the suite
 * attaches to it for what only a socket can do.
 */

/** The address of the workbench of a folder — the folder in the search, never in the path. */
export function workbenchAddress(folder: string): string {
  return `/workbench?${new URLSearchParams({ folder }).toString()}`;
}

/** Whether the browser is on the workbench of exactly `folder`. */
export function onWorkbenchOf(folder: string): (url: URL) => boolean {
  return (url) => url.pathname === '/workbench' && url.searchParams.get('folder') === folder;
}

/** The "Open folder" dialog, wherever it was opened from. */
export function folderDialog(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('dialog', { name: 'Open folder' });
}

/** The folders the dialog lists where it is, by their accessible names. */
export function optionsOf(dialog: ReturnType<Page['getByRole']>): ReturnType<Page['getByRole']> {
  return dialog.getByRole('listbox').getByRole('option');
}

/**
 * The accessible names of the folders the dialog lists where it is, in order — what a screen reader
 * says of each row: its name, or "name, symbolic link".
 */
export function namesListed(dialog: ReturnType<Page['getByRole']>): Promise<string[]> {
  return optionsOf(dialog).evaluateAll((options) =>
    options.map((option) => option.getAttribute('aria-label') ?? option.textContent.trim()),
  );
}

/**
 * Goes down the dialog one folder at a time, from where it is — each step a click on the folder's
 * row, and a wait for the list of the folder it went into.
 *
 * @param names the accessible name of each row, in order: a folder's name, or the symbolic link's
 *   "name, symbolic link"
 */
export async function goDown(
  dialog: ReturnType<Page['getByRole']>,
  names: readonly string[],
): Promise<void> {
  for (const name of names) {
    await dialog.getByRole('option', { name, exact: true }).click();
    await expect(dialog.getByRole('listbox')).toHaveAccessibleName(
      `Folders in ${name.replace(/, symbolic link$/, '')}`,
    );
  }
}

/**
 * Opens a folder through the dialog, already open: from the roots, down `names`, then **Open**.
 *
 * @param rootLabel the label of the allowlist root the folder is under, as the dialog lists it
 */
export async function openThroughDialog(
  page: Page,
  rootLabel: string,
  names: readonly string[],
): Promise<void> {
  const dialog = folderDialog(page);

  await expect(dialog).toBeVisible();
  await goDown(dialog, [rootLabel, ...names]);
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** The folder tabs across the top of the workbench, on a wide screen. */
export function tabStrip(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('navigation', { name: 'Open folders' });
}

/** The button of one folder tab, by the folder's name. */
export function tabOf(page: Page, name: string): ReturnType<Page['getByRole']> {
  return tabStrip(page)
    .getByRole('button', { name: new RegExp(`^${name}\\b`) })
    .first();
}

/**
 * The first prompt of a session a test opens: a recorded turn that only answers — no tool, no file,
 * and a word ("red") no scenario looks for — so what the test does next starts from a session that
 * ran one quiet turn.
 */
export const OPENING_PROMPT = 'say hello [fixture:image-turn]';

/**
 * Sends the first prompt of the draft — what opens the session (plan 08, D-07). The prompt stays in
 * the box when the start is refused, so sending again is this same call.
 */
export async function sendFirstPrompt(page: Page, prompt: string = OPENING_PROMPT): Promise<void> {
  await promptBox(page).fill(prompt);
  await sendButton(page).click();
}

/**
 * Opens a session from the draft and waits for its opening turn to end: a prompt sent next is a
 * turn of its own, never one queued behind the opening (plan 08, D-14).
 */
export async function openFromDraft(page: Page): Promise<string> {
  await sendFirstPrompt(page);
  const sessionId = await openedSessionOf(page);
  await expect(turnsEnded(page, 1)).toBeVisible();

  return sessionId;
}

/**
 * Signs in on the workbench of `folder` and starts a session there, the way a person does — its
 * first prompt, {@link OPENING_PROMPT} — and answers the session it opened, its opening turn ended.
 *
 * @param webUrl the web to open it on — the main one, unless a scenario needs the limits stack's
 */
export async function sessionInTab(
  page: Page,
  user: ScenarioUser,
  folder: string,
  webUrl: string = environment.webUrl,
): Promise<string> {
  await openSignedIn(page, user, workbenchAddress(folder), webUrl);
  await expect(connectedStatus(page)).toBeVisible();

  return openFromDraft(page);
}

/**
 * Closes the folder tab a test opened — never its sessions. Every test here opens a folder of its
 * own, and a user holds at most eight tabs: the ninth would meet the ceiling.
 */
export async function closeTab(user: AuthenticatedUser, folder: string): Promise<void> {
  const response = await callApi(
    user,
    `/workspaces/open-folders?${new URLSearchParams({ path: folder }).toString()}`,
    { method: 'DELETE' },
  );

  expect([204, 404]).toContain(response.status);
}
