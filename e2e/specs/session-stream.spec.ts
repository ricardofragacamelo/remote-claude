import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';

import { E2eSocket, pongOf } from '../fixtures/ws';
import { signIn } from '../fixtures/auth';
import type { AuthenticatedUser } from '../fixtures/auth';
import { scenario } from '../scenarios';

/**
 * S-29, S-27 and S-28 — the stream, at the level where only e2e can reach it.
 *
 * Replay and gap are the two behaviours whose whole point is that the socket **went away**. A unit
 * test drives the buffer and an integration test drives the gateway; neither of them can drop a
 * real connection and bring a second one back holding a real credential, which is what these do.
 */

const replay = scenario('replay');
const gap = scenario('replay-gap');

/** Signed in once for the whole file: the credential is the subject of the UI spec, not of this. */
let user: AuthenticatedUser;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  user = await signIn(browser, replay.user);
});

/** Opens an authenticated socket. */
async function connected(): Promise<E2eSocket> {
  const socket = await E2eSocket.open();
  await socket.authenticate(user.accessToken);
  return socket;
}

/** Pings once and answers the pong that came back. */
async function ping(
  socket: E2eSocket,
  sessionId: string | null,
): Promise<{ sessionId: string; seq: number; pingCount: number }> {
  const nonce = `e2e-${String(Date.now())}-${String(Math.random())}`;
  socket.send('session.ping', { ...(sessionId === null ? {} : { sessionId }), nonce });

  const frame = await socket.waitFor(
    (candidate) => candidate.type === 'session.pong' && pongOf(candidate).nonce === nonce,
  );

  const pong = pongOf(frame);
  return { sessionId: pong.sessionId, seq: frame.seq ?? 0, pingCount: pong.pingCount };
}

test('S-29 — a token the local provider really issued opens an authenticated socket', async () => {
  const socket = await connected();

  const ready = socket.frames.find((frame) => frame.type === 'connection.ready');
  const payload = ready?.payload as {
    connectionId?: string;
    limits?: { replayBufferSize: number };
  };

  expect(payload.connectionId).toEqual(expect.any(String));
  // The server announces its limits instead of letting a client discover them by being refused.
  expect(payload.limits?.replayBufferSize).toBeGreaterThan(0);

  socket.close();
});

test(`${replay.id} — ${replay.title}`, async () => {
  const expected = replay.expect as { missedWhileAway: number; gap: boolean };

  // The first ping opens the session, so its own pong is the first event of the stream.
  const first = await connected();
  const opened = await ping(first, null);
  expect(opened.seq).toBe(1);
  first.close();

  // While the first client is away, a second one moves the stream on.
  const other = await connected();
  other.send('session.attach', { sessionId: opened.sessionId });
  await other.waitFor((frame) => frame.type === 'session.attached');

  const missed: number[] = [];
  for (let index = 0; index < expected.missedWhileAway; index += 1) {
    missed.push((await ping(other, opened.sessionId)).seq);
  }

  const back = await connected();
  back.send('session.attach', { sessionId: opened.sessionId, resumeFromSeq: opened.seq });

  const attached = await back.waitFor((frame) => frame.type === 'session.attached');
  const ack = attached.payload as { replayed: number; gap: boolean };

  expect(ack.gap).toBe(expected.gap);
  expect(ack.replayed).toBe(expected.missedWhileAway);

  // The ack goes out before the events it announces, so the last one has to be waited for: reading
  // the list straight after the ack asserts on a stream that has not finished arriving.
  const lastMissed = missed.at(-1) ?? 0;
  await back.waitFor((frame) => frame.kind === 'event' && (frame.seq ?? 0) >= lastMissed);

  // Exactly what was missed, in order, once each — no hole and no duplicate.
  const replayed = back.frames
    .filter((frame) => frame.kind === 'event' && frame.sessionId === opened.sessionId)
    .map((frame) => frame.seq ?? 0);

  expect(replayed).toEqual(missed);

  other.close();
  back.close();
});

test(`${gap.id} — ${gap.title}`, async () => {
  const expected = gap.expect as { gap: boolean; replayed: number; overflowMargin: number };

  const producer = await connected();
  const opened = await ping(producer, null);

  const ready = producer.frames.find((frame) => frame.type === 'connection.ready');
  const capacity = (ready?.payload as { limits: { replayBufferSize: number } }).limits
    .replayBufferSize;

  // Overflowing the ring is the only honest way to produce a gap: the buffer is what decides, and
  // its size is a property of the server, announced in the handshake rather than assumed here.
  // The frames go out a hundred at a time: one at a time is a round trip per event and minutes of
  // wall clock, and all of them at once is a thousand queries queued on a ten-connection pool.
  const target = capacity + expected.overflowMargin;
  const batchSize = 100;

  for (let sent = 1; sent < target;) {
    const last = Math.min(target - 1, sent + batchSize - 1);

    for (let index = sent; index <= last; index += 1) {
      producer.send('session.ping', {
        sessionId: opened.sessionId,
        nonce: `overflow-${String(index)}`,
      });
    }

    sent = last + 1;
    await producer.waitFor(
      (frame) => frame.type === 'session.pong' && (frame.seq ?? 0) >= sent,
      60_000,
    );
  }

  // Coming back from before what the buffer still holds. A partial replay is never stitched: a
  // client that believes it has everything and does not is worse than one told to reload.
  const late = await connected();
  late.send('session.attach', { sessionId: opened.sessionId, resumeFromSeq: 1 });

  const attached = await late.waitFor((frame) => frame.type === 'session.attached');
  const ack = attached.payload as { replayed: number; gap: boolean; oldestAvailableSeq: number };

  expect(ack.gap).toBe(expected.gap);
  expect(ack.replayed).toBe(expected.replayed);
  expect(ack.oldestAvailableSeq).toBeGreaterThan(1);

  producer.close();
  late.close();
});
