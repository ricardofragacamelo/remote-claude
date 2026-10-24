import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import type { AuthenticatedUser } from './auth';
import { environment } from './environment';
import { conversationIn } from './conversation';
import type { ConversationRef } from './conversation';
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

/**
 * The side bar's own name — the name of the agent it is a chat with — never a Claude-specific
 * default past this one place: a spec of the test engine (plan 28, B-44) passes its own
 * `agent: 'Test agent'` to every locator below that needs it, and the equivalence of S-123 is that
 * nothing else about these locators has to change for that to work.
 */
const DEFAULT_AGENT = 'Claude Code';

/** The panel of the agent of the folder tab on screen — named by [agent], Claude's by default. */
export function panelOf(page: Page, agent: string = DEFAULT_AGENT): Locator {
  return page.getByRole('complementary', { name: agent });
}

/** The box a person writes the prompt in, at the foot of the panel. */
export function promptBox(page: Page, agent: string = DEFAULT_AGENT): Locator {
  return panelOf(page, agent).getByLabel('Prompt', { exact: true });
}

/** The button that sends what the box holds, while nothing runs. */
export function sendButton(page: Page, agent: string = DEFAULT_AGENT): Locator {
  return panelOf(page, agent).getByRole('button', { name: 'Send', exact: true });
}

/**
 * The chip of the engine a draft opens on — "Agent: Installation default" (plan 28, B-44). Only the
 * direct chip, never the overflow's nested submenu of the same control: a viewport wide enough for
 * the panel's own row (`test.use({ viewport })`, the same way a spec of a long conversation widens
 * it — plan 09, F1) is what every spec of this family already assumes for `modeChip` and the rest,
 * and a nested Radix submenu driven by a synthetic pointer is a fight nothing here needs to pick.
 */
export function enginePickerChip(
  page: Page,
  agent: string = DEFAULT_AGENT,
  value?: string,
): Locator {
  return panelOf(page, agent).getByRole('button', {
    name: value === undefined ? /^Agent: / : `Agent: ${value}`,
  });
}

/** Picks [agent] in the open menu of {@link enginePickerChip} — the name `GET /engines` gives it. */
export async function pickEngine(page: Page, agent: string): Promise<void> {
  await enginePickerChip(page).click();
  await page.getByRole('menuitem', { name: agent }).click();
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

/**
 * The meter of how full the context window is — absent entirely for an engine with no `contextUse`
 * (plan 28, S-124): it is never even asked for then, the same way the chip of the compact it opens
 * is never offered without `compaction`.
 */
export function contextMeter(page: Page, agent: string = DEFAULT_AGENT): Locator {
  return panelOf(page, agent).getByRole('button', { name: /^Context window \d+% used$/ });
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

/**
 * The chip of the model a session opened with — "Model: Sonnet" — of any model, or of the one
 * given: what `session.started` resolved, by a default of the screen or the installation's own
 * (plan 13, B-41, S-185).
 *
 * @param model the display name of the model the chip should say, as the installation lists it
 */
export function modelChip(page: Page, model?: string): Locator {
  return panelOf(page).getByRole('button', {
    name: model === undefined ? /^Model: / : `Model: ${model}`,
  });
}

/**
 * The MCP indicator of the panel's header (plan 13, B-22, D-14) — "{{fine}} of {{count}} MCP
 * server(s) connected", absent entirely while the session has none (S-44). The one place this
 * spec's own fixture server shows as a live session sees it: the store's screen only ever answers
 * the store's own `pending`/`disabled` (plan 13, B-42).
 *
 * @param fine how many of the session's servers are connected, if the count matters to the caller
 * @param count how many servers the session has, if the count matters to the caller
 */
export function mcpIndicatorButton(page: Page, fine?: number, count?: number): Locator {
  const name =
    fine === undefined || count === undefined
      ? /MCP server/
      : `${fine} of ${count} MCP server(s) connected`;

  return panelOf(page).getByRole('button', { name });
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
 * How the label of a call of each tool the scenarios ask about begins — what a card is named by
 * since the label comes from the backend, by kind (plan 28, B-18): "Permission for Shell: ls". The
 * scenarios keep naming the tool; this is the one place that knows its label.
 */
const LABEL_START: Readonly<Record<string, string>> = {
  Bash: 'Shell: ',
  Read: 'Read ',
  Write: 'Write ',
  Edit: 'Edit ',
  MultiEdit: 'Edit ',
  NotebookEdit: 'Edit the notebook ',
  WebFetch: 'Fetch ',
  WebSearch: 'Search the web ',
};

/** The accessible name of the card that asks about a call of [toolName]. */
function cardName(toolName: string): RegExp {
  const start = (LABEL_START[toolName] ?? toolName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^Permission for ${start}`);
}

/**
 * The question on screen about one tool — its card, in the conversation where the tool is, or at
 * its end until the tool's line arrives (plan 09, B-23).
 */
export function cardFor(page: Page, toolName: string, agent: string = DEFAULT_AGENT): Locator {
  return panelOf(page, agent).getByRole('listitem', { name: cardName(toolName) });
}

/**
 * The card of a question inside the conversation — in the place of its tool, or at its end while
 * the tool's line has not arrived (plan 09, D-12). The scripted backend fires every hook of a turn at
 * its first tool, so a question about a later tool comes before that tool's line.
 */
export function inlineCardFor(page: Page, toolName: string): Locator {
  return conversationScroller(page).getByRole('listitem', { name: cardName(toolName) });
}

/** The card of a question standing exactly where the line of its tool would be. */
export function cardInPlaceOf(page: Page, toolName: string): Locator {
  return conversationOf(page).getByRole('listitem', { name: cardName(toolName) });
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
export function decisionLine(
  page: Page,
  text: string | RegExp,
  agent: string = DEFAULT_AGENT,
): Locator {
  return conversationOf(page, agent).getByText(text);
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
export function conversationOf(page: Page, agent: string = DEFAULT_AGENT): Locator {
  return panelOf(page, agent).getByRole('list', { name: 'Conversation' });
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
export function sessionLabelOf(page: Page, agent: string = DEFAULT_AGENT): Locator {
  // Plan 09, B-06: the session is the frame of the conversation, named by its id — no card says it.
  return panelOf(page, agent).getByRole('region', {
    name: /^Session [0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/,
  });
}

/**
 * The session the browser just opened, read off the chat beside the editor.
 *
 * A session born in a folder tab stays in that tab — the chat is never a screen of its own
 * (plan 06, S-115) — so its id is what the side bar says, not an address the browser moved to.
 */
export async function openedSessionOf(page: Page, agent: string = DEFAULT_AGENT): Promise<string> {
  const label = sessionLabelOf(page, agent);

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
export async function send(page: Page, text: string, agent: string = DEFAULT_AGENT): Promise<void> {
  const box = promptBox(page, agent);

  await box.fill(text);
  await expect(sendButton(page, agent)).toBeEnabled();
  await box.press('Enter');
}

/**
 * The compact row of one tool — "Read notes.md", "Shell: ls" — in the state given.
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
export function turnSummaries(page: Page, agent: string = DEFAULT_AGENT): Locator {
  return panelOf(page, agent).getByText(/^Turn(?: ended)?: /);
}

/**
 * Sends a recorded turn from the box of the panel and waits for it to end, allowing on its card each
 * tool named in `allow`, in order — one more summary of a turn, whatever turns came before.
 *
 * @param agent the name of the side bar the turn runs in — Claude's by default, "Test agent" for a
 *   conversation of the test engine (plan 28, B-44): the same replay, read off the same locators.
 */
export async function recordedTurn(
  page: Page,
  fixture: string,
  allow: readonly string[] = [],
  text = 'do the work',
  agent: string = DEFAULT_AGENT,
): Promise<void> {
  const summaries = turnSummaries(page, agent);
  const before = await summaries.count();

  await send(page, `${text} [fixture:${fixture}]`, agent);
  for (const toolName of allow) {
    await allowOnce(cardFor(page, toolName, agent)).click();
  }
  await expect(summaries).toHaveCount(before + 1);
}

/** The conversation a live session writes to, as `session.attached` names it to a socket of the suite. */
export async function conversationOfSession(
  user: AuthenticatedUser,
  sessionId: string,
): Promise<ConversationRef> {
  const socket = await connected(user);
  try {
    await attachFrom(socket, sessionId, 0);
    const attached = socket.frames.find((frame) => frame.type === 'session.attached');

    return conversationIn((attached?.payload as { conversation?: unknown }).conversation);
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
