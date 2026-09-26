import { expect, test } from '@playwright/test';
import type { Envelope } from '@remote-claude/contracts';

import { approvedPhone, connectedPhone, registerPhone, revokePhone } from '../fixtures/devices';
import type { Phone } from '../fixtures/devices';
import {
  attachFrom,
  connected,
  permissionAsked,
  prompt,
  startSession,
  workspaceFor,
} from '../fixtures/live-session';
import type { E2eSocket } from '../fixtures/ws';
import { scenario } from '../scenarios';

/**
 * The mandatory end-to-end scenarios that only exist with two ends: permission from the phone (3),
 * the race between the two (4), and two clients seeing the same stream (10), from the list in
 * docs/architecture/shared/06-testing-strategy.md — plus the protocol half of a pending phone and
 * of a revocation.
 *
 * The phone here is the **contract**, not the app: a socket that authenticates with the
 * installation in the handshake, exactly as the app does, over a device registered and approved
 * through the HTTP API. The app proves the same flows through its screens in
 * `mobile/integration_test/`, which needs an emulator and is not a gate; this suite runs on every
 * pull request, against the same scripted backend, and is what makes up for that
 * (docs/plans/02-mobile-approval/F4-e2e.md).
 */

const fromThePhone = scenario('mobile-permission');
const race = scenario('mobile-race');
const sameStream = scenario('mobile-multi-client');
const pending = scenario('mobile-device-pending');
const revoked = scenario('mobile-revoked');

const context = workspaceFor(fromThePhone.user);

/** The browser opens a session and the phone attaches to it, both from the start. */
async function browserAndPhone(phone: Phone): Promise<{
  web: E2eSocket;
  mobile: E2eSocket;
  sessionId: string;
}> {
  const web = await connected(context().user);
  const sessionId = await startSession(web, context().workspace);
  const mobile = await connectedPhone(context().user, phone);
  await attachFrom(mobile, sessionId, 0);

  return { web, mobile, sessionId };
}

/** Both ends on a session, with the phone approved, and the turn that asks for permission sent. */
async function promptedWithAnApprovedPhone(fixture: string): Promise<{
  web: E2eSocket;
  mobile: E2eSocket;
  sessionId: string;
}> {
  const ends = await browserAndPhone(await approvedPhone(context().user));
  prompt(ends.web, ends.sessionId, fixture);
  return ends;
}

/**
 * Ends the session and lets both sockets go.
 *
 * Closing the socket does not end the session — it keeps its subprocess for whoever attaches
 * next — and the backend holds at most ten at once. A suite that only closed sockets would starve
 * every test after it of a session to open.
 */
async function finished(ends: {
  web: E2eSocket;
  mobile: E2eSocket;
  sessionId: string;
}): Promise<void> {
  ends.web.send('session.close', { sessionId: ends.sessionId });
  await ends.web.waitFor(
    (frame) => frame.type === 'session.closed' && frame.sessionId === ends.sessionId,
    30_000,
  );
  ends.web.close();
  ends.mobile.close();
}

function requestIdOf(request: Envelope): string {
  return String((request.payload as { requestId: string }).requestId);
}

function resolvedOf(socket: E2eSocket, requestId: string): Promise<Envelope> {
  return socket.waitFor(
    (frame) =>
      frame.type === 'permission.resolved' &&
      (frame.payload as { requestId?: string }).requestId === requestId,
  );
}

test(`${fromThePhone.id} — ${fromThePhone.title}`, async () => {
  const expected = fromThePhone.expect as {
    fixture: string;
    toolName: string;
    decision: string;
    resolvedFrom: string;
  };

  const ends = await promptedWithAnApprovedPhone(expected.fixture);
  const { web, mobile } = ends;

  // Both are asked; only the phone answers.
  const request = await permissionAsked(mobile);
  await permissionAsked(web);
  expect(request.payload).toMatchObject({ toolName: expected.toolName });

  const requestId = requestIdOf(request);
  mobile.respond(request, { requestId, decision: expected.decision, scope: 'once' });

  // The browser only watches — and what it sees says the answer came from a phone.
  expect((await resolvedOf(web, requestId)).payload).toMatchObject({
    requestId,
    decision: expected.decision,
    auto: false,
    resolvedBy: context().user.userId,
    resolvedFrom: expected.resolvedFrom,
  });

  // The loop was blocked on that answer; the turn only finishes because it arrived.
  await web.waitFor((frame) => frame.type === 'turn.completed', 30_000);
  await finished(ends);
});

test(`${race.id} — ${race.title}`, async () => {
  const expected = race.expect as { fixture: string };

  const ends = await promptedWithAnApprovedPhone(expected.fixture);
  const { web, mobile } = ends;

  const request = await permissionAsked(web);
  await permissionAsked(mobile);
  const requestId = requestIdOf(request);

  // Opposite answers, sent together. Which one lands first is the server's to decide.
  mobile.respond(request, { requestId, decision: 'allow', scope: 'once' });
  web.respond(request, { requestId, decision: 'deny', reason: 'refused from e2e', scope: 'once' });

  const onWeb = await resolvedOf(web, requestId);
  const onPhone = await resolvedOf(mobile, requestId);

  // One decision reached the agent, and both ends were told the same one — including the end
  // that lost, which learns who won from the event rather than from an error.
  expect(onPhone.payload).toEqual(onWeb.payload);
  expect(['allow', 'deny']).toContain((onWeb.payload as { decision: string }).decision);

  for (const socket of [web, mobile]) {
    expect(socket.frames.some((frame) => frame.kind === 'error')).toBe(false);
    expect(
      socket.frames.filter(
        (frame) =>
          frame.type === 'permission.resolved' &&
          (frame.payload as { requestId?: string }).requestId === requestId,
      ),
    ).toHaveLength(1);
  }

  await finished(ends);
});

test(`${sameStream.id} — ${sameStream.title}`, async () => {
  const expected = sameStream.expect as { fixture: string; decision: string };

  const ends = await promptedWithAnApprovedPhone(expected.fixture);
  const { web, mobile, sessionId } = ends;

  const request = await permissionAsked(mobile);
  mobile.respond(request, {
    requestId: requestIdOf(request),
    decision: expected.decision,
    scope: 'once',
  });

  await web.waitFor((frame) => frame.type === 'turn.completed', 30_000);
  await mobile.waitFor((frame) => frame.type === 'turn.completed', 30_000);

  // The same events, with the same numbers, in the same order — the phone got the first ones by
  // replay and the rest live, and it cannot tell the difference. Neither can anybody reading it.
  const timeline = (socket: E2eSocket): string[] =>
    socket.frames
      .filter((frame) => frame.kind === 'event' && frame.sessionId === sessionId)
      .map((frame) => `${String(frame.seq)}:${frame.type}`);

  expect(timeline(mobile)).toEqual(timeline(web));
  expect(timeline(web).length).toBeGreaterThan(3);

  await finished(ends);
});

test(`${pending.id} — ${pending.title}`, async () => {
  const expected = pending.expect as { fixture: string; code: string };

  const ends = await browserAndPhone(await registerPhone(context().user));
  const { web, mobile, sessionId } = ends;
  prompt(web, sessionId, expected.fixture);

  // A pending phone watches: the question reaches it...
  const request = await permissionAsked(mobile);

  // ...and its answer is refused, with the code the app explains on screen.
  mobile.respond(request, { requestId: requestIdOf(request), decision: 'allow', scope: 'once' });
  const refusal = await mobile.waitFor((frame) => frame.kind === 'error');
  expect(refusal.payload).toMatchObject({ code: expected.code, httpEquivalent: 403 });

  // Nothing was decided by it: the browser still settles the question.
  web.respond(request, { requestId: requestIdOf(request), decision: 'deny', reason: 'e2e' });
  expect((await resolvedOf(web, requestIdOf(request))).payload).toMatchObject({
    decision: 'deny',
    resolvedFrom: 'web',
  });

  await finished(ends);
});

test(`${revoked.id} — ${revoked.title}`, async () => {
  const expected = revoked.expect as { closeCode: number };

  const phone = await approvedPhone(context().user);
  const mobile = await connectedPhone(context().user, phone);

  await revokePhone(context().user, phone);

  // At once, on the socket that was already open — not when its token runs out.
  expect((await mobile.waitForClose()).code).toBe(expected.closeCode);
});
