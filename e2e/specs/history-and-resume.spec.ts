import { expect, test } from '@playwright/test';

import { approvedPhone, connectedPhone } from '../fixtures/devices';
import {
  completedTurn,
  framesCounted,
  messagesOn,
  said,
  scratchFolders,
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
import { closeTab, sessionInTab } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The history, through the doors a person uses — plan 04, F5 (B-22, B-23).
 *
 * Every conversation here is one the run itself produced: the scripted backend writes what it
 * replays to its store of conversations, as `persistSession: true` does. So "reload after a gap" and
 * "open on the phone" read back what the product wrote a moment earlier, never a transcript
 * somebody planted.
 *
 * Continuing an old conversation from the web, and the refusal when its folder is gone (04·S-46,
 * 04·S-53), only had a door in `/history`, which plan 06 removed
 * ([D-07](../../docs/plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)):
 * they left this suite with the route and come back with the Sessions view of plan 08. The app
 * still proves the history on the phone.
 *
 * Each test works in a folder of its own inside the allowlist, gone after it.
 */

const overflow = scenario('history-gap');
const onThePhone = scenario('mobile-history');

const context = workspaceFor(overflow.user);
const scratch = scratchFolders();

/** How many messages a page of the transcript holds. */
function messagesIn(page: TranscriptPage): number {
  return page.events.filter((event) => event.type === 'message.completed').length;
}

test(`${overflow.id} — ${overflow.title}`, async ({ page }) => {
  const expected = overflow.expect as { fixture: string; answer: string; overflowMargin: number };
  const network = await SwitchableSocket.on(page);
  const workspace = scratch(context().workspace);

  // Started where a person starts it — in the tab of its folder (plan 06, B-33) — and driven from a
  // socket of the suite, which keeps talking while the browser is away.
  const sessionId = await sessionInTab(page, overflow.user, workspace);
  const producer = await connected(context().user);
  await attachFrom(producer, sessionId, 0);
  const attached = producer.frames.find((frame) => frame.type === 'session.attached');
  const conversationId = String(
    (attached?.payload as { claudeSessionId?: unknown }).claudeSessionId,
  );

  try {
    await completedTurn(producer, sessionId, expected.fixture);
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
    await closeTab(context().user, workspace);
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
