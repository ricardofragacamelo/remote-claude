import fs from 'node:fs';

import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';

import { environment } from '../fixtures/environment';
import { connected, openWorkspace, startSession } from '../fixtures/live-session';
import type { LiveSessionContext } from '../fixtures/live-session';
import { scenario } from '../scenarios';

/**
 * S-83 — the one suite that talks to the real Claude.
 *
 * Everything under `specs/` runs against a replay of a recorded run, because an end-to-end test
 * has to be deterministic and Claude is not. This is the exception, and it exists to catch the
 * thing nothing else can: **the SDK changing its contract under us**.
 *
 * What it asserts is deliberately narrow. Not the words the model chose — those are different
 * every time, and a test that pinned them would be a test that fails for no reason. What it
 * asserts is that every message of a real turn was one this build **recognises**: the mapper's
 * survival branch turns an unknown variant into a warning rather than an outage, and a warning
 * nobody reads is how a contract break reaches production quietly.
 *
 * It is not a gate ([D-12](../../docs/plans/01-live-session/decisions.md)): it needs a Claude
 * logged in on this machine and it costs money per run. `pnpm test:e2e:live` is how it is asked
 * for, on purpose.
 */

const live = scenario('live-session');

/** Signed in once, against the allowlist of the running stack. */
let context: LiveSessionContext;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  // The same helper the hermetic suite uses, because it is the same two doors: the provider's
  // login and the workspace list.
  context = await openWorkspace(browser, live.user);
});

test('S-83 — a real session answers, and no message falls into the unknown branch', async () => {
  const socket = await connected(context.user);
  const sessionId = await startSession(socket, context.workspace);

  // Trivial on purpose: what is being measured is the shape of the stream, not the model's
  // ability to do anything. A long task would cost more and prove the same thing.
  socket.send('session.prompt', { sessionId, text: 'Reply with the single word: pong.' });

  const turn = await socket.waitFor((frame) => frame.type === 'turn.completed', 300_000);

  expect(turn.payload).toMatchObject({
    turnId: expect.any(String),
    costUsd: expect.any(String),
    durationMs: expect.any(Number),
  });

  // The answer arrived as our contract, never as an `SDKMessage`: around thirty-eight variants of
  // somebody else's pre-1.0 union, and this is where we find out it still maps.
  const types = new Set(socket.frames.map((frame) => frame.type));
  expect(types).toContain('message.completed');

  // **It really reached the model.** A CLI pointed at a configuration with no login answers with
  // a notice of its own, as a perfectly well-formed turn — and a suite that only checked the
  // shape of the stream would go green having talked to nothing at all. This is the one assertion
  // about what was said, and it is here for that reason.
  expect(answerOf(socket)).not.toMatch(/not logged in|\/login/i);

  socket.send('session.close', { sessionId });
  await socket.waitFor((frame) => frame.type === 'session.closed');

  // **The claim of this whole suite.** `unmapped sdk message variant — dropped` is what the
  // runner logs when the SDK sends something this build has never seen. The survival rule means
  // the session carried on regardless — which is right, and is also exactly why a warning nobody
  // reads is how a contract break reaches production quietly. This is where it is read.
  expect(unknownVariants()).toEqual([]);

  socket.close();
});

/** What the assistant said, as one string. */
function answerOf(socket: Awaited<ReturnType<typeof connected>>): string {
  return socket.frames
    .filter((frame) => frame.type === 'message.completed')
    .flatMap((frame) => (frame.payload as { content?: { text?: string }[] }).content ?? [])
    .map((block) => block.text ?? '')
    .join(' ');
}

/** Every SDK message variant this build failed to recognise during the run. */
function unknownVariants(): string[] {
  const log = fs.readFileSync(environment.backendLog, 'utf8');

  return log
    .split('\n')
    .filter((line) => line.includes('unmapped sdk message variant'))
    .map((line) => {
      const parsed = JSON.parse(line) as { variant?: string };
      return parsed.variant ?? 'unknown';
    });
}
