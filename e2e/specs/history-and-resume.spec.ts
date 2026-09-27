import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { approvedPhone, connectedPhone } from '../fixtures/devices';
import {
  completedTurn,
  endSession,
  framesCounted,
  messagesOn,
  said,
  scratchFolders,
  send,
  sessionScreen,
  startConversation,
  SwitchableSocket,
  transcriptOf,
} from '../fixtures/history';
import type { TranscriptPage } from '../fixtures/history';
import {
  attachFrom,
  closeSession,
  connected,
  lastSeqOf,
  prompt,
  pushPastSeq,
  replayBufferSize,
  sequencesOf,
  timelineOf,
  workspaceFor,
} from '../fixtures/live-session';
import type { E2eSocket } from '../fixtures/ws';
import { scenario } from '../scenarios';

/**
 * The history and the resume, through the doors a person uses — plan 04, F5 (B-22, B-23).
 *
 * Every conversation here is one the run itself produced: the scripted backend writes what it
 * replays to its store of conversations, as `persistSession: true` does. So "continue", "reload
 * after a gap" and "open on the phone" read back what the product wrote a moment earlier, never a
 * transcript somebody planted.
 *
 * Each test works in a folder of its own inside the allowlist, gone after it.
 */

const resumed = scenario('history-resume');
const overflow = scenario('history-gap');
const onThePhone = scenario('mobile-history');
const removed = scenario('history-workspace-removed');

const context = workspaceFor(resumed.user);
const scratch = scratchFolders();

/** A conversation of one finished turn, in a folder of its own, with its session still open. */
async function aConversation(fixture: string): Promise<{
  socket: E2eSocket;
  sessionId: string;
  conversationId: string;
  workspace: string;
}> {
  const workspace = scratch(context().workspace);
  const socket = await connected(context().user);
  const opened = await startConversation(socket, workspace);
  await completedTurn(socket, opened.sessionId, fixture);

  return { socket, workspace, ...opened };
}

/** The live session a resume became, read off the address the screen moved to. */
async function resumedSessionOf(page: import('@playwright/test').Page): Promise<string> {
  await page.waitForURL('**/sessions/*');
  return decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) ?? '');
}

/** How many messages a page of the transcript holds. */
function messagesIn(page: TranscriptPage): number {
  return page.events.filter((event) => event.type === 'message.completed').length;
}

test(`${resumed.id} — ${resumed.title}`, async ({ page }) => {
  const expected = resumed.expect as { fixture: string; answer: string; continued: string };
  const first = await aConversation(expected.fixture);
  await closeSession(first.socket, first.sessionId);

  // The history of that conversation, from a link, signed out.
  await openSignedIn(page, resumed.user, `/history/${first.conversationId}`);
  await expect(page.getByText('Opened here')).toBeVisible();
  await expect(messagesOn(page).filter({ hasText: expected.answer })).toHaveCount(1);

  await page.getByRole('button', { name: 'Continue this conversation' }).click();
  const sessionId = await resumedSessionOf(page);

  try {
    // What was said before this session began is on screen — it came from the transcript, since
    // the buffer of a new session holds nothing of it.
    await expect(messagesOn(page).filter({ hasText: expected.answer })).toHaveCount(1);

    await send(page, expected.continued);
    await expect(messagesOn(page).filter({ hasText: expected.answer })).toHaveCount(2);

    // Continued **in place**: one of ours keeps its file, so the conversation the history reads
    // now holds both turns, in order.
    const transcript = await transcriptOf(context().user, first.conversationId);
    expect(said(transcript, 'assistant')).toEqual([expected.answer, expected.answer]);
    expect(said(transcript, 'user').at(-1)).toBe(expected.continued);
  } finally {
    await endSession(context().user, sessionId);
  }
});

test(`${overflow.id} — ${overflow.title}`, async ({ page }) => {
  const expected = overflow.expect as { fixture: string; answer: string; overflowMargin: number };
  const network = await SwitchableSocket.on(page);
  const { socket: producer, sessionId, conversationId } = await aConversation(expected.fixture);

  try {
    await sessionScreen(page, overflow.user, sessionId);
    await expect(messagesOn(page).filter({ hasText: expected.answer })).toHaveCount(1);

    // The browser goes away without a goodbye, and stays away...
    await network.cut();
    await expect(page.getByText('Reconnecting…').first()).toBeVisible();

    // ...while the session moves on past everything the buffer can hold.
    let turns = 1;
    await pushPastSeq(producer, replayBufferSize(producer) + expected.overflowMargin, () => {
      turns += 1;
      prompt(producer, sessionId, expected.fixture);
    });
    await framesCounted(producer, 'turn.completed', turns, 120_000);

    // Back: the server says gap, and the screen reads the conversation the ack named — by HTTP.
    const reloaded = page.waitForResponse(
      (response) =>
        response.url().includes(`/transcripts/${conversationId}/messages`) &&
        response.request().method() === 'GET',
      { timeout: 90_000 },
    );
    network.restore();
    const response = await reloaded;
    expect(response.status()).toBe(200);
    expect(network.attachAcks.at(-1)?.payload).toMatchObject({
      gap: true,
      replayed: 0,
      claudeSessionId: conversationId,
    });
    const latest = (await response.json()) as TranscriptPage;

    // Coherent: what the screen had before is gone, and the page read back is there once — every
    // message of it, none twice. A partial hole stitched over would show more, or fewer.
    await expect(messagesOn(page)).toHaveCount(messagesIn(latest));
    await expect(messagesOn(page).last()).toContainText(expected.answer);

    // And the stream carries on on top of it, without repeating anything the reload brought.
    const before = messagesIn(latest);
    await completedTurn(producer, sessionId, expected.fixture);
    await expect(messagesOn(page)).toHaveCount(before + 1);
  } finally {
    await closeSession(producer, sessionId);
  }
});

test(`${onThePhone.id} — ${onThePhone.title}`, async () => {
  const expected = onThePhone.expect as { fixture: string; answer: string; prompt: string };
  const workspace = scratch(context().workspace);

  const web = await connected(context().user);
  const { sessionId, conversationId } = await startConversation(web, workspace);
  await completedTurn(web, sessionId, expected.fixture, expected.prompt);

  const phone = await approvedPhone(context().user);
  const mobile = await connectedPhone(context().user, phone);

  try {
    // Opened on the phone after the fact. The app says it has nothing — `resumeFromSeq: 0`, never
    // an absent one, which asks for nothing past — and gets everything the buffer holds.
    const ack = await attachFrom(mobile, sessionId, 0);
    const attached = mobile.frames.find((frame) => frame.type === 'session.attached');

    expect(ack.gap).toBe(false);
    expect(ack.replayed).toBe(sequencesOf(web, sessionId).length);
    expect(attached?.payload).toMatchObject({ claudeSessionId: conversationId });

    await mobile.waitFor((frame) => (frame.seq ?? 0) >= lastSeqOf(web));
    expect(timelineOf(mobile, sessionId)).toEqual(timelineOf(web, sessionId));

    // And the history the phone reads by HTTP — its installation named, as the app sends it — is
    // the conversation the browser had.
    const transcript = await transcriptOf(context().user, conversationId, phone.installId);
    expect(said(transcript, 'user')).toEqual([`${expected.prompt} [fixture:${expected.fixture}]`]);
    expect(said(transcript, 'assistant')).toEqual([expected.answer]);
  } finally {
    mobile.close();
    await closeSession(web, sessionId);
  }
});

test(`${removed.id} — ${removed.title}`, async ({ page }) => {
  const expected = removed.expect as { fixture: string; notFound: string; notAllowed: string };
  const conversation = await aConversation(expected.fixture);
  await closeSession(conversation.socket, conversation.sessionId);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-e2e-outside-'));

  try {
    await openSignedIn(page, removed.user, `/history/${conversation.conversationId}`);
    const resume = page.getByRole('button', { name: 'Continue this conversation' });
    await expect(resume).toBeEnabled();

    // The folder is deleted while the screen is open...
    fs.rmSync(conversation.workspace, { recursive: true, force: true });
    await resume.click();
    await expect(page.getByText(expected.notFound)).toBeVisible();

    // ...and comes back as a link to somewhere the allowlist does not reach. The name is inside a
    // root; where it leads is not, and the real path is the one checked.
    fs.symlinkSync(outside, conversation.workspace);
    await resume.click();
    await expect(page.getByText(expected.notAllowed)).toBeVisible();

    // Refused before anything was spawned: the screen never left the history.
    expect(new URL(page.url()).pathname).toBe(`/history/${conversation.conversationId}`);
  } finally {
    fs.rmSync(conversation.workspace, { force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
