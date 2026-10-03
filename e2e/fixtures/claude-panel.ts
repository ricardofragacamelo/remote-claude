import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import type { AuthenticatedUser } from './auth';
import { environment } from './environment';
import { attachFrom, connected } from './live-session';

/**
 * The panel of Claude, from the outside — plan 08, F6, and its page object since plan 09, B-03.
 *
 * What a person sees beside the explorer and the editor, by the names a screen reader says. Nothing
 * here reaches into `web/src`: the strings are the English ones the scenarios of `e2e/scenarios/`
 * carry, so a renamed button fails here, where a person would have looked for it.
 *
 * This is the **one** place of the suite that knows how to find a control of the panel — the box,
 * sending, stopping, the mode, the menus of the session, the card of a permission, the line of a
 * turn. A spec asks for the control here and never spells its locator again: when a phase of plan 09
 * moves the panel around, it changes this file, not the specs (09 · R-01).
 */

/** The panel of Claude of the folder tab on screen. */
export function panelOf(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Claude' });
}

/** The box a person writes the prompt in, at the foot of the panel. */
export function promptBox(page: Page): Locator {
  return panelOf(page).getByLabel('Prompt', { exact: true });
}

/** The button that sends what the box holds, while nothing runs. */
export function sendButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'Send', exact: true });
}

/**
 * The same button in a session that ended: what is sent resumes the conversation first (plan 09,
 * D-05).
 */
export function resumeAndSendButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'Resume and send', exact: true });
}

/** The same button while a turn runs: what is sent waits in the queue. */
export function addToQueueButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'Add to queue', exact: true });
}

/** The same button while a prompt of the conversation is being edited, to send it again. */
export function sendAgainButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'Send again', exact: true });
}

/**
 * The button that stops the turn that runs — in the bar of the box, where send is (plan 09, D-06):
 * the button itself with nothing written, beside send with something written.
 */
export function interruptButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'Stop', exact: true });
}

/** The menu of the session, in the header of the panel (plan 09, B-17). */
export function sessionMenuButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'More actions of the session' });
}

/** Opens the menu of the session, and answers its item named `name`. */
export async function sessionMenuItem(page: Page, name: string | RegExp): Promise<Locator> {
  await sessionMenuButton(page).click();
  return page.getByRole('menuitem', { name });
}

/**
 * The item of the menu of the session that ends it — only the browser that opened it may — once the
 * menu is open.
 */
export function endSessionItem(page: Page): Promise<Locator> {
  return sessionMenuItem(page, /^End session/);
}

/** Ends the session from its menu, confirming what it asks (plan 09, D-10). */
export async function endSession(page: Page): Promise<void> {
  await (await endSessionItem(page)).click();
  await page.getByRole('button', { name: 'End the session' }).click();
}

/** The `/` of the bar of the box: it writes `/` at the start and opens the commands (plan 09, B-12). */
export function commandsToggle(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'Commands and skills (/)' });
}

/** One command of the open list of `/`, by the name it starts with — `/init`, `/review`. */
export function suggestedCommand(page: Page, command: string): Locator {
  return menuOf(page, 'commands')
    .getByRole('option', { name: new RegExp(`^${command}\\b`) })
    .first();
}

/** Opens the undo of the session — an item of its menu, which opens a dialog (plan 09, B-17). */
export async function openUndo(page: Page): Promise<Locator> {
  await (await sessionMenuItem(page, 'Undo file changes…')).click();
  return page.getByRole('dialog', { name: 'Undo points' });
}

/** What the last undo did, file by file. */
export function lastUndoReport(page: Page): Locator {
  // In the dialog of the undo, over the page — not in the panel (plan 09, B-17).
  return page
    .getByRole('dialog', { name: 'Undo points' })
    .getByRole('region', { name: 'Last undo' });
}

/**
 * Opens the undo panel of the session on screen and the confirmation of its only point — the turn
 * the recorded `do the work` prompt started.
 */
export async function confirmationOfTheOnlyPoint(page: Page): Promise<Locator> {
  await openUndo(page);
  await page
    .getByRole('list', { name: 'Undo points' })
    .getByRole('button', { name: /do the work/ })
    .click();

  return page.getByRole('group', { name: 'Undo these file changes?' });
}

/**
 * The chip of the permission mode — "Mode: Ask before edits" — of any mode, or of the one given.
 *
 * @param mode the name of the mode the chip should say, as the menu lists it
 */
export function modeChip(page: Page, mode?: string): Locator {
  return panelOf(page).getByRole('button', {
    name: mode === undefined ? /^Mode: / : `Mode: ${mode}`,
  });
}

/** The button that shows, in the panel, what the session changed. */
export function showChangesButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'What the session changed' });
}

/** The view of what the session changed, once shown. */
export function changesRegion(page: Page): Locator {
  return panelOf(page).getByRole('region', { name: 'Changes' });
}

/** The prompts sent during a turn, waiting for it to end. */
export function waitingPrompts(page: Page): Locator {
  return panelOf(page).getByRole('region', { name: 'Waiting prompts' });
}

/**
 * The question on screen about one tool — its card, in the conversation where the tool is, or at
 * its end until the tool's line arrives (plan 09, B-23).
 */
export function cardFor(page: Page, toolName: string): Locator {
  return panelOf(page).getByRole('listitem', { name: `Permission for ${toolName}` });
}

/**
 * The card of a question inside the conversation — in the place of its tool, or at its end while
 * the tool's line has not arrived (plan 09, D-12). The scripted backend fires every hook of a turn at
 * its first tool, so a question about a later tool comes before that tool's line.
 */
export function inlineCardFor(page: Page, toolName: string): Locator {
  return conversationScroller(page).getByRole('listitem', { name: `Permission for ${toolName}` });
}

/** The card of a question standing exactly where the line of its tool would be. */
export function cardInPlaceOf(page: Page, toolName: string): Locator {
  return conversationOf(page).getByRole('listitem', { name: `Permission for ${toolName}` });
}

/**
 * The last line of the conversation while a turn runs — the asterisk, what Claude does, the time
 * (plan 09, B-21). A line, not a control: found by its mark, as a message is (`messagesOn`).
 */
export function workingIndicator(page: Page): Locator {
  return panelOf(page).locator('[data-working-indicator]');
}

/** The pill above the box that says a question waits out of view, and takes the person to it. */
export function pendingPill(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: /^Claude is waiting for your answer \(\d+\)$/ });
}

/** A thinking that ended, folded — "Thought for 2 s", or "Thought" from the history. */
export function thoughtLines(page: Page): Locator {
  return conversationOf(page)
    .locator('details')
    .filter({ hasText: /^Thought/ });
}

/** The line a settled card became: "Allowed by you", "Allowed on a phone by …". */
export function decisionLine(page: Page, text: string | RegExp): Locator {
  return conversationOf(page).getByText(text);
}

/** The answer of a card that lets the tool run, this once. */
export function allowOnce(card: Locator): Locator {
  return card.getByRole('button', { name: 'Allow once' });
}

/** The answer of a card that refuses the tool. */
export function refuse(card: Locator): Locator {
  return card.getByRole('button', { name: 'Refuse' });
}

/**
 * What the chat beside the editor says, one list item per message — and per tool, and per end of a
 * turn (plan 08, F2).
 */
export function conversationOf(page: Page): Locator {
  return panelOf(page).getByRole('list', { name: 'Conversation' });
}

/**
 * The messages on a screen — the session's, or the history's — one list item each. Only the
 * messages: the conversation also lists its tools and the end of each turn (plan 08, F2).
 */
export function messagesOn(page: Page): Locator {
  return conversationOf(page).locator('li[data-message-id]');
}

/**
 * The draft of a new conversation, in the chat beside the editor — what a folder tab shows before it
 * has a session (plan 08, D-07): nothing runs until its first prompt.
 */
export function draftOf(page: Page): Locator {
  return panelOf(page).getByRole('group', { name: 'How the conversation starts' });
}

/** The button of the reader of a conversation of the history that goes on with it, as a session. */
export function continueConversationButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'Continue this conversation' });
}

/** Where the chat beside the editor names the session it shows — once it shows one. */
export function sessionLabelOf(page: Page): Locator {
  // Plan 09, B-06: the session is the frame of the conversation, named by its id — no card says it.
  return panelOf(page).getByRole('region', { name: /^Session [0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/ });
}

/**
 * The session the browser just opened, read off the chat beside the editor.
 *
 * A session born in a folder tab stays in that tab — the chat is never a screen of its own
 * (plan 06, S-115) — so its id is what the side bar says, not an address the browser moved to.
 */
export async function openedSessionOf(page: Page): Promise<string> {
  const label = sessionLabelOf(page);

  await expect(label).toBeVisible();
  return ((await label.getAttribute('aria-label')) ?? '').replace('Session ', '');
}

/**
 * The line that ends the `turns`-th turn of the conversation — there once that many turns ended.
 * The total of the session left the top of the panel for the status of its header (plan 09, D-11).
 */
export function turnsEnded(page: Page, turns: number): Locator {
  return turnSummaries(page).nth(turns - 1);
}

/**
 * The status of a session with nothing running — the dot of the header, which says it in words
 * (plan 09, B-18).
 */
export function idleStatus(page: Page): Locator {
  return panelOf(page).getByRole('img', { name: /^Connected — nothing running/ });
}

/** The dot of the header that says how the session stands, by colour and by word. */
export function statusDot(page: Page): Locator {
  return panelOf(page).getByRole('img', { name: /· Session [0-9A-Z]{26}/ });
}

/** The status line of a connection that is up — the page's socket, authenticated. */
export function connectedStatus(page: Page): Locator {
  return page.getByText('Connected', { exact: true }).first();
}

/**
 * Writes a prompt into the screen's box and sends it, the way a person does — with Enter, as the
 * composer sends (plan 08, B-46). Not by clicking: the button sits at the foot of the panel, where
 * the toasts of the notification centre appear, and a pointer held over a toast keeps it on screen
 * (the toaster pauses its timer on hover) — a click that waits for it never lands.
 */
export async function send(page: Page, text: string): Promise<void> {
  const box = promptBox(page);

  await box.fill(text);
  await expect(sendButton(page)).toBeEnabled();
  await box.press('Enter');
}

/**
 * The compact row of one tool — "Read notes.md", "Bash: ls" — in the state given.
 *
 * @param label the line of the row, or a pattern of it: a replay keeps the recording's input, so a
 *   path the replay does not move is the recording's `/workspace/…`
 */
export function toolRow(page: Page, label: string | RegExp, state = 'Done'): Locator {
  const rows = panelOf(page);

  return typeof label === 'string'
    ? rows.getByRole('button', { name: `${label} — ${state}. Show the exact input`, exact: true })
    : rows.getByRole('button', {
        name: new RegExp(`^${label.source} — ${state}\\. Show the exact input$`),
      });
}

/** Reloads the page, the way a person presses F5, and waits for its socket to be back. */
export async function reloaded(page: Page): Promise<void> {
  await page.reload();
  await expect(connectedStatus(page)).toBeVisible();
}

/** The line that ends each turn: its cost, how long it took and its tokens — or that it stopped. */
export function turnSummaries(page: Page): Locator {
  return panelOf(page).getByText(/^Turn(?: ended)?: /);
}

/**
 * Sends a recorded turn from the box of the panel and waits for it to end, allowing on its card each
 * tool named in `allow`, in order — one more summary of a turn, whatever turns came before.
 */
export async function recordedTurn(
  page: Page,
  fixture: string,
  allow: readonly string[] = [],
  text = 'do the work',
): Promise<void> {
  const summaries = turnSummaries(page);
  const before = await summaries.count();

  await send(page, `${text} [fixture:${fixture}]`);
  for (const toolName of allow) {
    await allowOnce(cardFor(page, toolName)).click();
  }
  await expect(summaries).toHaveCount(before + 1);
}

/** The conversation a live session writes to, as `session.attached` names it to a socket of the suite. */
export async function conversationOfSession(
  user: AuthenticatedUser,
  sessionId: string,
): Promise<string> {
  const socket = await connected(user);
  try {
    await attachFrom(socket, sessionId, 0);
    const attached = socket.frames.find((frame) => frame.type === 'session.attached');

    return String((attached?.payload as { claudeSessionId?: unknown }).claudeSessionId);
  } finally {
    socket.close();
  }
}

/** What Claude can say back: the menu of `/` and of `@`, by what each lists. */
export function menuOf(page: Page, name: 'commands' | 'files'): Locator {
  return page.getByRole('listbox', {
    name:
      name === 'commands'
        ? 'Commands and skills of this installation'
        : 'Files, folders and more to add to the context',
  });
}

/** The chips of the context of the next prompt. */
export function contextChips(page: Page): Locator {
  return panelOf(page).getByRole('list', { name: 'Context of the next prompt' });
}

/**
 * Plants a conversation **begun elsewhere** in `cwd` — what the editor of the person would be
 * writing now — through the door the scripted backend opens for it, out of a captured run.
 *
 * The only conversation of plan 08's suite the run does not produce itself: what makes it external
 * is that this product never opened it ([F6](../../docs/plans/08-claude-panel/F6-e2e.md)).
 *
 * @returns the id of the conversation
 */
export async function plantedElsewhere(
  cwd: string,
  fixture: string,
  title: string,
): Promise<string> {
  const conversationId = randomUUID();
  const response = await fetch(`${environment.backendUrl}/e2e/conversations-elsewhere`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversationId, cwd, fixture, title }),
  });

  expect(response.status).toBe(201);
  return conversationId;
}

/** The part of the browser's `DataTransfer` a drop from the desktop fills. */
interface BrowserTransfer {
  readonly items: { add(file: File): unknown };
}

/**
 * A 16×16 red PNG, as base64 — the image the spike of D-02 asked the real model the colour of
 * (`scripts/record-agent-sdk-fixtures.mjs`): what a person drags from the desktop.
 */
export const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4I2JDEmIY1TCqYfhqAAAeBCwQ8YdREQAAAABJRU5ErkJggg==';

/**
 * Drops a file of the desktop on a target, as the browser hands it over: a `DataTransfer` holding a
 * real `File`. A drag from outside the page is the one gesture Playwright cannot start, so the
 * events it would fire are dispatched with what it would carry.
 */
export async function dropFromDesktop(
  page: Page,
  target: Locator,
  file: { readonly name: string; readonly type: string; readonly base64: string },
): Promise<void> {
  const transfer = await page.evaluateHandle((dropped) => {
    const bytes = Uint8Array.from(atob(dropped.base64), (char) => char.charCodeAt(0));
    // The suite compiles without the DOM's types; in the page, the constructor is the browser's.
    const { DataTransfer } = globalThis as unknown as { DataTransfer: new () => BrowserTransfer };
    const data = new DataTransfer();
    data.items.add(new File([bytes], dropped.name, { type: dropped.type }));
    return data;
  }, file);

  await target.dispatchEvent('dragenter', { dataTransfer: transfer });
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
}

/**
 * The one part of the frame of the session on screen that scrolls — the middle of its three
 * (plan 09, B-05). It has no role of its own: it is found as the frame's middle child.
 */
export function conversationScroller(page: Page): Locator {
  return sessionLabelOf(page).locator(':scope > div').nth(1);
}

/** The button of the header that opens the conversations of the folder — the Sessions view. */
export function historyButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'The conversations of this folder' });
}

/** The button of the header that opens a new conversation, in a tab of its own. */
export function newConversationButton(page: Page): Locator {
  return panelOf(page).getByRole('button', { name: 'Open a new conversation' });
}

/** The tabs of the conversations of the folder, in the header of the panel. */
export function conversationTabs(page: Page): Locator {
  return panelOf(page).getByRole('list', { name: 'Conversations of this folder' });
}

/** The bar under the box: `+`, `/`, the choices of the conversation, and send or stop. */
export function composerBar(page: Page): Locator {
  return promptBox(page).locator('xpath=following-sibling::div[1]');
}

/** The frame of a new conversation, before it is one. */
export function draftFrame(page: Page): Locator {
  return panelOf(page).getByRole('region', { name: 'A new conversation' });
}
