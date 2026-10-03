import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import {
  addToQueueButton,
  allowOnce,
  cardFor,
  conversationOfSession,
  inlineCardFor,
  interruptButton,
  messagesOn,
  openedSessionOf,
  panelOf,
  plantedElsewhere,
  promptBox,
  send,
  sendAgainButton,
  turnsEnded,
  waitingPrompts,
} from '../fixtures/claude-panel';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { completedTurn, endSession, startConversation } from '../fixtures/history';
import { attachFrom, closeSession, connected, prompt } from '../fixtures/live-session';
import { sessionInTab, tabOf, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The sessions of a folder, its tabs and its queue, through the door a person uses — plan 08, F6,
 * B-56 (S-264…S-267; the phone, S-268, is `claude-panel-phone.spec.ts`, since a viewport is a file's).
 *
 * The live session and the history are the run's own: sessions it opened, conversations its scripted
 * Claude wrote and ended. The one conversation planted is the one **active elsewhere** — what the
 * editor of the person would be writing — since what makes it external is that this product never
 * opened it.
 *
 * Continuing a conversation from the Sessions view by reading it first, and the refusal when its
 * folder is gone, are 04·S-46 and 04·S-53 in `history-and-resume.spec.ts`, which plan 06 took out of
 * the web and plan 08 gave back (B-12); here the view continues one straight from its row.
 */

/** A prompt of the scenario, and the recording it asks the scripted Claude for. */
interface Prompted {
  readonly prompt: string;
  readonly fixture: string;
}

const sessions = scenario('panel-sessions');
const expected = sessions.expect as {
  groups: Record<'running' | 'elsewhere' | 'history', string>;
  elsewhere: { fixture: string; title: string };
  ended: { fixture: string; prompt: string };
  forkTitle: string;
  askingTurn: string;
  badge: string;
  gone: string;
  held: { prompt: string; fixture: string };
  queued: [Prompted, Prompted];
  cancelled: string;
  edited: { prompt: string; fixture: string; answer: string };
};

const suite = workbenchSuite(sessions.user);
const opened = sessionsOpened(suite.user);

/** A folder of the test as a tab, and a session opened in it from its draft. */
async function sessionHere(page: Page): Promise<{ folder: string; sessionId: string }> {
  const folder = suite.tree().gamma;
  await suite.openTab(folder);

  return { folder, sessionId: await sessionInTab(page, sessions.user, folder) };
}

/** One group of the Sessions view, by its title. */
function group(page: Page, title: string): Locator {
  return page.getByRole('region', { name: new RegExp(`^${title}`) });
}

/** Shows the Sessions view in the side bar — its button toggles it, so only when it is not shown. */
async function showSessions(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Claude sessions', exact: true });

  if ((await button.getAttribute('aria-pressed')) !== 'true') {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** The Explorer of the folder tab on screen — its tree is empty in a folder with nothing in it. */
function explorerOf(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Explorer' });
}

/**
 * Sends a prompt while a turn runs: with Enter, as the composer sends, once its button says the
 * prompt will wait in the queue (plan 08, B-46).
 */
async function sendToQueue(page: Page, text: string): Promise<void> {
  const box = promptBox(page);

  await box.fill(text);
  await expect(addToQueueButton(page)).toBeEnabled();
  await box.press('Enter');
}

/**
 * Edits a prompt of the conversation on screen and sends it again: the box takes the prompt as it
 * was sent — and only then is it rewritten.
 */
async function editAndSendAgain(page: Page, sent: Prompted, edited: Prompted): Promise<void> {
  const text = `${sent.prompt} [fixture:${sent.fixture}]`;
  const box = promptBox(page);

  await messagesOn(page)
    .filter({ hasText: text })
    .getByRole('button', { name: 'Edit and send again' })
    .click();
  await expect(box).toHaveValue(text);
  await box.fill(`${edited.prompt} [fixture:${edited.fixture}]`);
  await sendAgainButton(page).click();
}

/** Picks one action of the menu of a row of the Sessions view. */
async function fromRow(row: Locator, action: string): Promise<void> {
  await row.getByRole('button', { name: 'More actions' }).click();
  await row.page().getByRole('menuitem', { name: action, exact: true }).click();
}

/** The conversation a session writes to. */
function conversationOf(sessionId: string): Promise<string> {
  return conversationOfSession(suite.user(), sessionId);
}

test(`${sessions.id} — the Sessions view lists a live session, one active elsewhere and the history; it opens, continues and forks from them (S-264)`, async ({
  page,
}) => {
  const folder = suite.tree().gamma;
  await suite.openTab(folder);

  // The history: a conversation of ours, ended.
  const ender = await connected(suite.user());
  const ended = await startConversation(ender, folder);
  await completedTurn(ender, ended.sessionId, expected.ended.fixture, expected.ended.prompt);
  await closeSession(ender, ended.sessionId);

  // Running here: a session another device of the person opened.
  const other = await connected(suite.user());
  const running = await startConversation(other, folder);
  opened(running.sessionId);
  other.close();

  // Active elsewhere: what the editor is writing now.
  const elsewhere = await plantedElsewhere(
    folder,
    expected.elsewhere.fixture,
    expected.elsewhere.title,
  );

  await openSignedIn(page, sessions.user, workbenchAddress(folder));
  await showSessions(page);

  const live = group(page, expected.groups.running);
  const active = group(page, expected.groups.elsewhere);
  const history = group(page, expected.groups.history);
  await expect(live.getByRole('button', { name: /^Open the session/ })).toHaveCount(1);
  await expect(
    active.getByRole('button', { name: `Read the conversation ${expected.elsewhere.title}` }),
  ).toBeVisible();
  await expect(
    history.getByRole('button', {
      name: new RegExp(`^Read the conversation ${expected.ended.prompt}`),
    }),
  ).toBeVisible();

  // Opened from its row: the live session is attached in the panel.
  await live.getByRole('button', { name: /^Open the session/ }).click();
  expect(await openedSessionOf(page)).toBe(running.sessionId);

  // Continued from its row: the conversation of the history goes on, in place, as a new session.
  await showSessions(page);
  await fromRow(
    history.getByRole('listitem').filter({ hasText: expected.ended.prompt }),
    'Continue here',
  );
  await expect.poll(() => openedSessionOf(page)).not.toBe(running.sessionId);
  const continued = await openedSessionOf(page);
  opened(continued);
  expect(await conversationOf(continued)).toBe(ended.conversationId);

  // Forked from its row: a conversation being written elsewhere is continued as a copy, after asking.
  await showSessions(page);
  await fromRow(
    active.getByRole('listitem').filter({ hasText: expected.elsewhere.title }),
    'Continue here, as a copy',
  );
  const asking = page.getByRole('dialog', { name: expected.forkTitle });
  await asking.getByRole('button', { name: 'Continue as a copy' }).click();
  await expect.poll(() => openedSessionOf(page)).not.toBe(continued);
  const forked = await openedSessionOf(page);
  opened(forked);
  const copy = await conversationOf(forked);
  expect(copy).not.toBe(elsewhere);
  expect(copy).not.toBe('');
});

test(`${sessions.id} — a question asked in a folder tab not on screen is a badge on the tab, and is answered there (S-265)`, async ({
  page,
}) => {
  const tree = suite.tree();
  await suite.openTab(tree.alpha);
  await suite.openTab(tree.gamma);

  const asking = await sessionInTab(page, sessions.user, tree.alpha);
  opened(asking);
  await tabOf(page, 'gamma').click();
  await expect(explorerOf(page)).toBeVisible();

  // The question comes while the browser is on the other folder.
  const socket = await connected(suite.user());
  await attachFrom(socket, asking, 0);
  const mark = socket.frames.length;
  prompt(socket, asking, expected.askingTurn);

  const badge = tabOf(page, 'alpha').getByRole('status', { name: expected.badge });
  await expect(badge).toBeVisible();

  // Answered in its tab — where the card stands in the conversation, in the place of its tool
  // (plan 09, S-72): the badge goes, and the turn ends.
  await tabOf(page, 'alpha').click();
  await expect(inlineCardFor(page, 'Write')).toBeVisible();
  await allowOnce(cardFor(page, 'Write')).click();
  await socket.waitFor(
    (frame) =>
      socket.frames.indexOf(frame) >= mark &&
      frame.type === 'turn.completed' &&
      frame.sessionId === asking,
    30_000,
  );
  await expect(badge).toHaveCount(0);
  socket.close();
});

test(`${sessions.id} — the link of a session opens its folder tab with the conversation in the panel, beside the explorer and the editor (S-266)`, async ({
  page,
}) => {
  const { folder, sessionId } = await sessionHere(page);
  const link = `${workbenchAddress(folder)}&${new URLSearchParams({ session: sessionId }).toString()}`;

  // Pasted into a browser that never had it on screen.
  const pasted = await page.context().browser()?.newContext();
  if (pasted === undefined) {
    throw new Error('the browser of the test is not there');
  }
  const elsewhere = await pasted.newPage();
  try {
    await openSignedIn(elsewhere, sessions.user, link);
    expect(await openedSessionOf(elsewhere)).toBe(sessionId);
    await expect(turnsEnded(elsewhere, 1)).toBeVisible();
    await expect(explorerOf(elsewhere)).toBeVisible();
    await expect(elsewhere.getByRole('region', { name: 'Editor' })).toBeVisible();

    // A link to a session that is gone says so, translated.
    await endSession(suite.user(), sessionId);
    await elsewhere.goto(link);
    await expect(elsewhere.getByText(expected.gone)).toBeVisible();
  } finally {
    await pasted.close();
  }
});

test(`${sessions.id} — two prompts sent during a turn wait in the queue, one is taken out; editing a prompt and sending it again forks the conversation (S-267)`, async ({
  page,
}) => {
  const { folder, sessionId } = await sessionHere(page);
  opened(sessionId);
  const conversation = await conversationOf(sessionId);

  // A turn that does not end until it is interrupted, and two prompts behind it.
  await send(page, `${expected.held.prompt} [fixture:${expected.held.fixture}]`);
  await expect(interruptButton(page)).toBeEnabled();
  for (const queued of expected.queued) {
    await sendToQueue(page, `${queued.prompt} [fixture:${queued.fixture}]`);
  }
  const queue = waitingPrompts(page);
  await expect(queue.getByRole('listitem')).toHaveCount(2);

  // The second one is taken out; interrupted, the turn ends and the first queued runs as its own.
  await queue.getByRole('button', { name: expected.cancelled }).click();
  await expect(queue.getByRole('listitem')).toHaveCount(1);
  await interruptButton(page).click();
  await expect(turnsEnded(page, 3)).toBeVisible();
  await expect(queue).toHaveCount(0);
  const [second, third] = expected.queued;
  await expect(messagesOn(page).filter({ hasText: folder })).toHaveCount(1);
  await expect(messagesOn(page).filter({ hasText: `${second.prompt} [` })).toHaveCount(1);
  await expect(messagesOn(page).filter({ hasText: `${third.prompt} [` })).toHaveCount(0);

  // Edited and sent again: a new conversation, from before that prompt; the original stays.
  await editAndSendAgain(page, second, expected.edited);

  await expect.poll(() => openedSessionOf(page)).not.toBe(sessionId);
  const fork = await openedSessionOf(page);
  opened(fork);
  await expect(messagesOn(page).filter({ hasText: expected.edited.answer })).not.toHaveCount(0);
  expect(await conversationOf(fork)).not.toBe(conversation);
  await expect(
    panelOf(page).getByRole('list', { name: 'Conversations of this folder' }).getByRole('listitem'),
  ).toHaveCount(2);
});
