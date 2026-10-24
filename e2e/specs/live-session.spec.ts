import { expect, test } from '@playwright/test';

import {
  attachFrom,
  closeSession,
  connected,
  expectRecycledBuffer,
  lastSeqOf,
  markAsTrusted,
  permissionAsked,
  prompt,
  pushPastSeq,
  replayBufferSize,
  sequencesOf,
  startSession,
  workspaceFor,
  statusReached,
  trustMarkOf,
} from '../fixtures/live-session';
import { scenario } from '../scenarios';

/**
 * The mandatory end-to-end scenarios this plan reaches.
 *
 * From the list in docs/architecture/shared/06-testing-strategy.md: the whole flow (1), permission
 * through the web (2), the deadline that refuses (5), replay (6), `gap` (7), interrupt (8) and a
 * workspace outside the allowlist (9). Three, four and ten need the phone, and belong to the
 * mobile plan.
 *
 * The Agent SDK behind the backend is a **replay of a recorded run** — the stack is started with
 * `backend start:scripted`. An end-to-end suite has to be deterministic and Claude is not, and
 * each real run costs money. The suite that talks to the real thing is `e2e/smoke-live/`.
 */

const whole = scenario('live-session');
const asking = scenario('live-permission');
const silence = scenario('live-permission-timeout');
const denied = scenario('live-workspace-denied');
const interrupted = scenario('live-interrupt');
const reconnect = scenario('live-replay');
const race = scenario('live-race');
const overflow = scenario('live-replay-gap');
const trusted = scenario('live-trusted-directory');

const context = workspaceFor(whole.user);

/** Opens a session on the workspace this suite signed in for. */
async function session(): Promise<{ socket: Awaited<ReturnType<typeof connected>>; id: string }> {
  const socket = await connected(context().user);
  return { socket, id: await startSession(socket, context().workspace) };
}

/**
 * Waits for the turn to end. A turn that never ends is the failure.
 *
 * Ending the session itself is the caller's job, in a `finally` — so a thrown assertion between
 * opening the session and this call never leaves it running for the rest of the suite to starve on
 * (the backend holds at most ten at once, and this stack's reaper is a 30-minute net, not a cleanup
 * for tests).
 */
async function finished(socket: Awaited<ReturnType<typeof connected>>): Promise<void> {
  await socket.waitFor((frame) => frame.type === 'turn.completed', 30_000);
}

/** Opens a session, prompts it, and stops at the question the recorded run always asks. */
async function asked(fixture: string): Promise<{
  socket: Awaited<ReturnType<typeof connected>>;
  id: string;
  request: Awaited<ReturnType<typeof permissionAsked>>;
  requestId: string;
}> {
  const { socket, id } = await session();
  prompt(socket, id, fixture);

  const request = await permissionAsked(socket);
  return {
    socket,
    id,
    request,
    requestId: String((request.payload as { requestId: string }).requestId),
  };
}

test(`${whole.id} — ${whole.title}`, async () => {
  const expected = whole.expect as {
    fixture: string;
    statusWhileAnswering: string;
    statusWhenDone: string;
  };

  const { socket, id: sessionId } = await session();

  try {
    prompt(socket, sessionId, expected.fixture);

    // The machine really moves: `session.started` already meant `idle`, the first fragment of the
    // answer says the model is thinking, and the finished turn says it is idle again.
    const thinking = await socket.waitFor((frame) => frame.type === 'session.statusChanged');
    expect(thinking.payload).toEqual({ status: expected.statusWhileAnswering });

    // The whole answer, not a fragment of it: `message.completed` supersedes the deltas.
    await socket.waitFor((frame) => frame.type === 'message.completed');
    const turn = await socket.waitFor((frame) => frame.type === 'turn.completed');

    expect(turn.payload).toMatchObject({ costUsd: expect.any(String) });

    expect((await statusReached(socket, expected.statusWhenDone)).payload).toEqual({
      status: expected.statusWhenDone,
    });
    expect(sequencesOf(socket, sessionId)).toEqual(
      // Every event of a session is numbered once, in order, with no hole: that is what makes
      // replay possible at all.
      Array.from({ length: sequencesOf(socket, sessionId).length }, (_unused, index) => index + 1),
    );
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${asking.id} — ${asking.title}`, async () => {
  const expected = asking.expect as {
    fixture: string;
    toolName: string;
    riskHint: string;
    decision: string;
    statusWhileAsking: string;
  };

  const { socket, id: sessionId, request, requestId } = await asked(expected.fixture);

  try {
    expect(request.kind).toBe('request');
    expect(request.payload).toMatchObject({
      toolName: expected.toolName,
      riskHint: expected.riskHint,
      defaultToNo: true,
    });

    // The one status a UI cannot afford to confuse with `running`: the agent loop has stopped on a
    // person, and a spinner for something that will never finish on its own is a lie.
    await statusReached(socket, expected.statusWhileAsking);

    socket.respond(request, { requestId, decision: expected.decision, scope: 'once' });

    const resolved = await socket.waitFor((frame) => frame.type === 'permission.resolved');
    expect(resolved.payload).toMatchObject({
      requestId,
      decision: expected.decision,
      auto: false,
      resolvedBy: context().user.userId,
    });

    // The loop was blocked on that answer; the turn only finishes because it arrived.
    await finished(socket);
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${silence.id} — ${silence.title}`, async () => {
  const expected = silence.expect as { fixture: string; decision: string; auto: boolean };

  const { socket, id: sessionId, requestId } = await asked(expected.fixture);

  try {
    // Nobody answers. Ours is the only timeout there is — the CLI imposes none, measured — and it
    // refuses. Silence never authorises.
    const resolved = await socket.waitFor((frame) => frame.type === 'permission.resolved', 30_000);

    expect(resolved.payload).toMatchObject({
      requestId,
      decision: expected.decision,
      auto: expected.auto,
    });
    expect((resolved.payload as { resolvedBy?: string }).resolvedBy).toBeUndefined();

    // And the session carries on: the refusal goes back to the model as a message, and the turn
    // finishes rather than hanging.
    await finished(socket);
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${denied.id} — ${denied.title}`, async () => {
  const expected = denied.expect as { path: string; code: string };

  const socket = await connected(context().user);
  socket.send('session.start', { workspacePath: expected.path });

  const failure = await socket.waitFor((frame) => frame.kind === 'error');

  // Refused before anything is spawned: `cwd` of the SDK's `query()` is exactly that path, and a
  // session that got as far as spawning on an unchecked directory is a shell on somebody's machine.
  expect(failure.payload).toMatchObject({ code: expected.code, httpEquivalent: 403 });
  expect(socket.frames.some((frame) => frame.type === 'session.started')).toBe(false);

  socket.close();
});

test(`${interrupted.id} — ${interrupted.title}`, async () => {
  const expected = interrupted.expect as { fixture: string; statusAfterInterrupt: string };

  const { socket, id: sessionId } = await session();

  try {
    // A turn that will not finish on its own: from the outside it is indistinguishable from a tool
    // that takes minutes, which is the case `session.interrupt` exists for.
    prompt(socket, sessionId, expected.fixture, 'do the work [hold]');
    await socket.waitFor((frame) => frame.type === 'message.completed');

    socket.send('session.interrupt', { sessionId });

    expect((await statusReached(socket, expected.statusAfterInterrupt)).payload).toEqual({
      status: expected.statusAfterInterrupt,
    });
    expect(socket.frames.some((frame) => frame.type === 'turn.completed')).toBe(true);
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${reconnect.id} — ${reconnect.title}`, async () => {
  const expected = reconnect.expect as { fixture: string; gap: boolean };

  const { socket: first, id: sessionId } = await session();
  let back: Awaited<ReturnType<typeof connected>> | undefined;

  try {
    prompt(first, sessionId, expected.fixture, 'do the work [hold]');
    const seen = await first.waitFor((frame) => frame.type === 'message.completed');
    const lastApplied = seen.seq ?? 0;

    // Not a close frame: the one thing replay exists for is the connection that did **not** say
    // goodbye.
    first.drop();

    back = await connected(context().user);
    expect((await attachFrom(back, sessionId, lastApplied)).gap).toBe(expected.gap);

    // The turn only finishes once the interrupt lands, so what the second socket receives is
    // exactly what the first one never saw.
    back.send('session.interrupt', { sessionId });
    await back.waitFor((frame) => frame.type === 'turn.completed');

    const replayed = sequencesOf(back, sessionId);
    expect(lastSeqOf(back)).toBeGreaterThan(lastApplied);
    expect(replayed.every((seq) => seq > lastApplied)).toBe(true);
    expect(new Set(replayed).size).toBe(replayed.length);
  } finally {
    // `back` is the socket to close through once it has attached; before that, `first` still
    // holds the session it opened; `first.drop()` is a dropped TCP connection, not a goodbye, so
    // sending on it is still exactly what a reconnecting client would do.
    await closeSession(back ?? first, sessionId);
  }
});

test(`${race.id} — ${race.title}`, async () => {
  const expected = race.expect as { fixture: string; decision: string };

  const { socket: first, id: sessionId } = await session();
  const second = await connected(context().user);

  try {
    await attachFrom(second, sessionId, 0);

    prompt(first, sessionId, expected.fixture);
    const request = await permissionAsked(first);
    const requestId = String((request.payload as { requestId: string }).requestId);

    first.respond(request, { requestId, decision: expected.decision, scope: 'once' });
    second.respond(request, { requestId, decision: 'deny', reason: 'too late', scope: 'once' });

    // Losing the race is not an error on either screen: the second client gets an ordinary ack and
    // the event tells it which decision actually reached the agent, and who made it.
    for (const socket of [first, second]) {
      const resolved = await socket.waitFor((frame) => frame.type === 'permission.resolved');
      expect(resolved.payload).toMatchObject({
        requestId,
        decision: expected.decision,
        resolvedBy: context().user.userId,
      });
    }

    expect(second.frames.some((frame) => frame.kind === 'error')).toBe(false);
  } finally {
    await closeSession(first, sessionId);
    second.close();
  }
});

test(`${trusted.id} — ${trusted.title}`, async () => {
  const expected = trusted.expect as { fixture: string; toolName: string };

  // The measurement behind this: in a directory the CLI has marked as trusted, `canUseTool` is
  // **not called at all** — the project `allow` rules answer instead, and the human approval this
  // product exists for silently stops happening ([D-11](docs/plans/01-live-session/decisions.md)).
  //
  // The mitigation is that the backend clears the mark before it opens a session. What is proved
  // here is the mitigation, through the door a user goes through: the directory is marked, and the
  // question still reaches the client.
  markAsTrusted(context().workspace);
  expect(trustMarkOf(context().workspace)).toBe(true);

  const { socket, id: sessionId, request } = await asked(expected.fixture);

  try {
    expect(request.payload).toMatchObject({ origin: { native: expected.toolName } });
    expect(trustMarkOf(context().workspace)).toBe(false);
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${overflow.id} — ${overflow.title}`, async () => {
  const expected = overflow.expect as {
    fixture: string;
    gap: boolean;
    replayed: number;
    overflowMargin: number;
  };

  const { socket: producer, id: sessionId } = await session();
  let late: Awaited<ReturnType<typeof connected>> | undefined;

  try {
    await pushPastSeq(producer, replayBufferSize(producer) + expected.overflowMargin, () => {
      prompt(producer, sessionId, expected.fixture);
    });

    // Coming back from before what the buffer still holds. A partial replay is never stitched: a
    // client that believes it has everything and does not is worse than one told to reload.
    late = await connected(context().user);
    expectRecycledBuffer(await attachFrom(late, sessionId, 1), expected);
  } finally {
    await closeSession(producer, sessionId);
    late?.close();
  }
});
