import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { signIn } from '../fixtures/auth';
import { environment } from '../fixtures/environment';
import { cardFor, send } from '../fixtures/history';
import {
  HammerableSocket,
  PageSockets,
  endOnLimits,
  fillUntilRefused,
  limitsSocket,
  openedSessionOf,
  sessionLabelOf,
  startButton,
  startOn,
  startScreen,
} from '../fixtures/limits';
import { workspaceFor } from '../fixtures/live-session';
import { endProviderSessions, shortenTokens } from '../fixtures/provider-admin';
import type { E2eSocket } from '../fixtures/ws';
import { scenario } from '../scenarios';

/**
 * The limits, through the door a person uses — plan 05, F4 (B-21…B-23).
 *
 * All of it runs on the **limits stack**, the second backend and web of the run, whose ceiling is
 * two sessions, whose TTL is twenty seconds and whose rate is the product's own twenty frames a
 * second. The main stack's numbers are the opposite of these, on purpose, for every other spec.
 *
 * What each scenario proves is the same thing from a different side: under a limit, the screen
 * says **what happened**, translated, and nothing sits there waiting for an answer that is never
 * coming. The difference between "the app froze" and "I hit the limit" is the message.
 */

const ceiling = scenario('limits-ceiling');
const freed = scenario('limits-slot-freed');
const lastSlot = scenario('limits-last-slot');
const idle = scenario('limits-idle');
const rate = scenario('limits-rate');
const expiry = scenario('limits-token-expiry');
const refused = scenario('limits-renewal-refused');

const context = workspaceFor(ceiling.user);

/** The refusal the screen shows, in the alert beside the starter. */
function refusalOn(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('alert');
}

/** The status line of a connection that is up. */
function connectedOn(page: Page): ReturnType<Page['getByText']> {
  return page.getByText('Connected', { exact: true }).first();
}

/** The expiry of an access token, in milliseconds since the epoch, read from its own claims. */
function expiryOf(token: string): number {
  const [, claims = ''] = token.split('.');
  return (
    (JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')) as { exp: number }).exp * 1_000
  );
}

/**
 * Runs `body` with the web's access tokens living `seconds`, and puts the provider back after it,
 * whatever happened.
 */
async function withShortTokens(seconds: number, body: () => Promise<void>): Promise<void> {
  const restore = await shortenTokens(environment.clientId, seconds);
  try {
    await body();
  } finally {
    await restore();
  }
}

/** Opens a session from the start screen and answers its id, from the chat it stays in. */
async function openedFromTheScreen(page: Page, workspacePath: string): Promise<string> {
  await startScreen(page, ceiling.user, workspacePath);
  await startButton(page).click();
  return openedSessionOf(page);
}

test.describe('the limits, on the screen', () => {
  /** The sessions a test opened, ended after it whatever happened. */
  const opened: string[] = [];
  let sockets: E2eSocket[] = [];

  test.afterEach(async ({ browser }) => {
    for (const socket of sockets) {
      socket.close();
    }
    sockets = [];

    // A fresh sign-in, not the context's: S-79 ends the user's sessions at the provider, and a
    // token from before that is one the backend may still take but the provider no longer backs.
    await endOnLimits(await signIn(browser, ceiling.user), opened.splice(0));
  });

  /**
   * A session opened from the start screen of the limits web, ended after the test, with the
   * screen connected to it.
   */
  async function onScreen(page: Page): Promise<string> {
    const sessionId = await openedFromTheScreen(page, context().workspace);
    opened.push(sessionId);
    await expect(connectedOn(page)).toBeVisible();
    return sessionId;
  }

  /**
   * A turn held open on screen: the recorded turn asks about a tool, and nobody answers yet.
   *
   * @returns the question's card, to answer it when the scenario says so
   */
  async function heldTurn(
    page: Page,
    expected: { readonly fixture: string; readonly toolName: string },
  ): Promise<ReturnType<Page['getByRole']>> {
    await onScreen(page);
    await send(page, `do the work [fixture:${expected.fixture}]`);

    const card = cardFor(page, expected.toolName);
    await expect(card).toBeVisible();
    return card;
  }

  /** A socket on the limits backend, closed after the test. */
  async function socketOnLimits(): Promise<E2eSocket> {
    const socket = await limitsSocket(context().user);
    sockets.push(socket);
    return socket;
  }

  test(`${ceiling.id} and ${freed.id} — ${ceiling.title}; ${freed.title}`, async ({ page }) => {
    const expected = ceiling.expect as { ceiling: number; code: string; refusal: string };
    const recorded = PageSockets.watch(page);

    // The screen first, so the machine fills while it is already looking at it.
    await startScreen(page, ceiling.user, context().workspace);

    const filler = await socketOnLimits();
    const full = await fillUntilRefused(filler, context().workspace);
    opened.push(...full.opened);
    expect(full.opened).toHaveLength(expected.ceiling);
    expect((full.refusal.payload as { code: string }).code).toBe(expected.code);

    await startButton(page).click();

    // S-41: what happened, translated, with the trace — and a button that is free again rather than
    // a "Starting…" that never ends.
    await expect(refusalOn(page).getByText(expected.refusal)).toBeVisible();
    await expect(refusalOn(page).getByText(/^Trace /)).toBeVisible();
    await expect(startButton(page)).toBeEnabled();

    // S-78: one ends, the slot is free, and the next attempt opens — the refusal gone with it.
    const [first = ''] = full.opened.splice(0, 1);
    opened.splice(opened.indexOf(first), 1);
    await endOnLimits(context().user, [first]);

    await startButton(page).click();
    opened.push(await openedSessionOf(page));
    await expect(refusalOn(page)).toBeHidden();

    // Nothing was retried behind the person's back: one start per click, two clicks.
    expect(recorded.sentOf('session.start')).toHaveLength(2);
  });

  test(`${lastSlot.id} — ${lastSlot.title}`, async ({ browser }) => {
    const expected = lastSlot.expect as { ceiling: number; refusal: string };
    // One slot left: every one but the last is taken.
    const filler = await socketOnLimits();
    for (let taken = 0; taken < expected.ceiling - 1; taken += 1) {
      const outcome = await startOn(filler, context().workspace);
      expect(outcome.refusal).toBeNull();
      opened.push(String(outcome.sessionId));
    }

    const pages = await Promise.all([1, 2].map(async () => (await browser.newContext()).newPage()));
    await Promise.all(pages.map((page) => startScreen(page, lastSlot.user, context().workspace)));

    // Both at once, through the button.
    await Promise.all(pages.map((page) => startButton(page).click()));

    /** Where one page stands: on the session it opened, told it was refused, or neither yet. */
    const stateOf = async (page: Page): Promise<'opened' | 'refused' | 'waiting'> => {
      if (await sessionLabelOf(page).isVisible()) {
        return 'opened';
      }
      return (await refusalOn(page).getByText(expected.refusal).isVisible())
        ? 'refused'
        : 'waiting';
    };

    // Exactly one opened; the other was told why — neither is left waiting.
    await expect
      .poll(async () => (await Promise.all(pages.map(stateOf))).sort())
      .toEqual(['opened', 'refused']);

    const states = await Promise.all(pages.map(stateOf));
    const winner = pages[states.indexOf('opened')];
    const loser = pages[states.indexOf('refused')];
    if (winner === undefined || loser === undefined) {
      throw new Error('the two pages changed state after they settled');
    }
    opened.push(await openedSessionOf(winner));

    // The one that lost has its button free again.
    await expect(startButton(loser)).toBeEnabled();

    await Promise.all(pages.map((page) => page.context().close()));
  });

  test(`${idle.id} — ${idle.title}`, async ({ page }) => {
    const expected = idle.expect as { fixture: string; idleTtlSeconds: number; reason: string };
    const sessionId = await onScreen(page);

    // S-84: opened from the start screen, it arrives as this browser's own — whole, and closable.
    await expect(page.getByRole('button', { name: 'End session' })).toBeEnabled();
    await expect(page.getByText(/only what the server still had in memory/)).toHaveCount(0);

    // One turn, so there is a conversation to go back to.
    await send(page, `say something [fixture:${expected.fixture}]`);
    await expect(page.getByText(/^Last turn cost/)).toBeVisible();

    // Then nothing — for longer than the TTL, plus the quarter of it the reaper may take to look.
    const ended = page.getByRole('status').filter({ hasText: expected.reason });
    await expect(ended).toBeVisible({ timeout: expected.idleTtlSeconds * 2_000 });

    // What only a live session can do is off. The screen says where to resume it — the history,
    // which the app has; the web's way there left with its route and comes back with plan 08
    // (plan 06, D-07, D-32).
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'See the whole conversation' })).toHaveCount(0);

    opened.splice(opened.indexOf(sessionId), 1);
  });

  test(`${rate.id} — ${rate.title}`, async ({ page }) => {
    const expected = rate.expect as {
      code: string;
      closeCode: number;
      burst: number;
      throttled: string;
    };
    const route = await HammerableSocket.on(page);
    await onScreen(page);
    const connectionsBefore = route.connectedAt.length;

    route.hammer(expected.burst);

    // Told why, translated — and holding, not reconnecting as if the network had gone.
    await expect(page.getByText(expected.throttled).first()).toBeVisible();

    const refusal = route.firstFromServer(
      (frame) => (frame.payload as { code?: string } | undefined)?.code === expected.code,
    );
    const retryAfterSeconds = (refusal?.frame.payload as { params: { retryAfterSeconds: number } })
      .params.retryAfterSeconds;

    // It comes back — no sooner than the server asked.
    await expect.poll(() => route.connectedAt.length).toBe(connectionsBefore + 1);
    const reconnectedAt = route.connectedAt.at(-1) ?? 0;
    expect(reconnectedAt - (refusal?.at ?? 0)).toBeGreaterThanOrEqual(retryAfterSeconds * 1_000);

    // And the session is watched again, from where it was: a turn sent now is seen through.
    await expect(connectedOn(page)).toBeVisible();
    await send(page, 'say something [fixture:text-turn]');
    await expect(page.getByText(/^Last turn cost/)).toBeVisible();
  });

  test(`${expiry.id} — ${expiry.title}`, async ({ page }) => {
    const expected = expiry.expect as {
      fixture: string;
      toolName: string;
      tokenLifetimeSeconds: number;
    };

    await withShortTokens(expected.tokenLifetimeSeconds, async () => {
      const recorded = PageSockets.watch(page);
      const card = await heldTurn(page, expected);

      // Counted from here: the sign-in itself reloads the page once the provider sends it back,
      // and a reload is a new socket by definition. What the scenario is about is the turn.
      const socketsOfTheTurn = recorded.opened.length;

      // The token the socket was opened with expires while the turn is still open…
      const handshake = recorded.sentOf('connection.authenticate').at(-1);
      const expiresAt = expiryOf(String((handshake?.payload as { token: string }).token));
      await expect
        .poll(() => Date.now() > expiresAt, { timeout: expected.tokenLifetimeSeconds * 2_000 })
        .toBe(true);

      // …and was renewed on the same socket before it did, and the server took the renewal.
      const renewals = recorded.sentOf('connection.reauthenticate').map((frame) => frame.id);
      expect(renewals.length).toBeGreaterThan(0);
      expect(
        recorded.received.some(
          (frame) =>
            frame.type === 'command.accepted' && renewals.includes(frame.correlationId ?? ''),
        ),
      ).toBe(true);

      // The turn carries on to its end, answered from the same screen.
      await card.getByRole('button', { name: 'Allow once' }).click();
      await expect(page.getByText(/^Last turn cost/)).toBeVisible();

      // And the person saw nothing: not one socket more across the expiry, nothing to reconnect,
      // nothing to sign in to, nothing refused.
      expect(recorded.opened).toHaveLength(socketsOfTheTurn);
      await expect(connectedOn(page)).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
    });
  });

  test(`${refused.id} — ${refused.title}`, async ({ page }) => {
    const expected = refused.expect as {
      fixture: string;
      toolName: string;
      tokenLifetimeSeconds: number;
      signIn: string;
    };

    await withShortTokens(expected.tokenLifetimeSeconds, async () => {
      await heldTurn(page, expected);

      // Cut off at the provider in the middle of the turn: the next renewal is refused.
      const renewal = page.waitForResponse((response) => response.url().endsWith('/auth/refresh'), {
        timeout: expected.tokenLifetimeSeconds * 2_000,
      });
      await endProviderSessions(refused.user.username);
      expect((await renewal).status()).toBe(401);

      // The screen says so and offers the way back, rather than a question nobody can answer.
      await expect(page.getByRole('heading', { name: expected.signIn })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    });
  });
});
