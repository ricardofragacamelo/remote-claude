import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';
import { PROTOCOL_VERSION } from '@remote-claude/contracts';
import type { Envelope } from '@remote-claude/contracts';
import type { Page, WebSocket as PageSocket, WebSocketRoute } from '@playwright/test';

import { limitsStack } from './environment';
import { openSignedIn } from './auth';
import { attachFrom, closeSession } from './live-session';
import { E2eSocket } from './ws';
import type { AuthenticatedUser } from './auth';
import type { ScenarioUser } from '../scenarios';

/**
 * Driving the limits stack — plan 05, F4.
 *
 * The limits stack is a second backend and web of the same run, sharing its database and its
 * provider, with the limits tightened: a ceiling of two sessions, twenty seconds idle, twenty frames
 * a second (`LIMITS_STACK` in `scripts/lib/stack.mjs`). A token from the provider is good on either
 * backend — same issuer, same audience — so the helpers below sign in once, anywhere.
 */

/** Opens an authenticated socket on the limits backend. */
export async function limitsSocket(user: AuthenticatedUser): Promise<E2eSocket> {
  const socket = await E2eSocket.open(limitsStack().wsUrl);
  await socket.authenticate(user.accessToken);
  return socket;
}

/** What one `session.start` came back with: the session it opened, or the refusal. */
export type StartOutcome =
  | { readonly sessionId: string; readonly refusal: null }
  | { readonly sessionId: null; readonly refusal: Envelope };

/** Starts a session from a socket, and answers what the server said to **that** command. */
export async function startOn(socket: E2eSocket, workspacePath: string): Promise<StartOutcome> {
  const commandId = socket.send('session.start', { workspacePath });
  const seen = socket.frames.length;

  const answer = await socket.waitFor(
    (frame) =>
      (frame.kind === 'error' && frame.correlationId === commandId) ||
      (frame.type === 'session.started' && socket.frames.indexOf(frame) >= seen),
  );

  if (answer.kind === 'error') {
    return { sessionId: null, refusal: answer };
  }

  return { sessionId: String((answer.payload as { sessionId: string }).sessionId), refusal: null };
}

/**
 * Opens sessions until the server refuses one, and answers the ones it opened and the refusal.
 *
 * Until refused, rather than a number of times: the ceiling is what the stack enforces, and the
 * scenario asserts it is the one it expects instead of assuming it.
 */
export async function fillUntilRefused(
  socket: E2eSocket,
  workspacePath: string,
  atMost = 10,
): Promise<{ readonly opened: string[]; readonly refusal: Envelope }> {
  const opened: string[] = [];

  for (let attempt = 0; attempt < atMost; attempt += 1) {
    const outcome = await startOn(socket, workspacePath);

    if (outcome.refusal !== null) {
      return { opened, refusal: outcome.refusal };
    }
    opened.push(outcome.sessionId);
  }

  throw new Error(`the limits stack opened ${String(atMost)} sessions and refused none`);
}

/**
 * Ends sessions of the limits stack from a socket of its own, attached first so it is told.
 *
 * Every scenario here ends what it opened: the next one counts slots, and a session left behind
 * would be a slot it cannot have.
 */
export async function endOnLimits(
  user: AuthenticatedUser,
  sessionIds: readonly string[],
): Promise<void> {
  for (const sessionId of sessionIds) {
    const socket = await limitsSocket(user);
    await attachFrom(socket, sessionId, 0);
    await closeSession(socket, sessionId);
  }
}

/** The web of the limits stack, signed in, on its start screen with `workspace` chosen. */
export async function startScreen(
  page: Page,
  user: ScenarioUser,
  workspaceLabel: string,
): Promise<void> {
  await openSignedIn(page, user, '/', limitsStack().webUrl);
  await expect(page.getByText('Connected', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: new RegExp(`^${escaped(workspaceLabel)}`) }).click();
}

/** The button that opens a session. */
export function startButton(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('button', { name: 'Start session' });
}

/** The session id of the screen the browser is on, once it is on one. */
export async function openedSessionOf(page: Page): Promise<string> {
  await page.waitForURL('**/sessions/*');
  return decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) ?? '');
}

/** Escapes a label for a regular expression. */
function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Everything the page's sockets carried, both ways, recorded as it happened.
 *
 * Playwright sees the page's WebSocket frames without touching them, which is what the scenarios
 * that are about **not** seeing anything need: how many sockets the page opened, and what it said
 * on them.
 */
export class PageSockets {
  readonly opened: PageSocket[] = [];
  readonly sent: Envelope[] = [];
  readonly received: Envelope[] = [];

  private constructor() {}

  /** Starts recording. Must run before the page opens its socket. */
  static watch(page: Page): PageSockets {
    const record = new PageSockets();

    page.on('websocket', (socket) => {
      record.opened.push(socket);
      socket.on('framesent', (frame) => record.sent.push(parsed(frame.payload)));
      socket.on('framereceived', (frame) => record.received.push(parsed(frame.payload)));
    });

    return record;
  }

  /** The commands of one type the page sent. */
  sentOf(type: string): Envelope[] {
    return this.sent.filter((frame) => frame.type === type);
  }
}

/** One frame's text, read as an envelope. */
function parsed(payload: string | Buffer): Envelope {
  return JSON.parse(payload.toString()) as Envelope;
}

/**
 * The page's socket, routed through the test so the test can speak **as** the page.
 *
 * What a person cannot do by clicking — send faster than the server allows — is done here on the
 * page's own connection, so the refusal, the `4429` and the wait all land on the page's client
 * exactly as they would on one that really hammered. Everything else goes through untouched.
 */
export class HammerableSocket {
  /** When each connection of the page reached the route, in order. */
  readonly connectedAt: number[] = [];

  /** What the server told the page, with when. */
  readonly fromServer: { readonly at: number; readonly frame: Envelope }[] = [];

  private server: WebSocketRoute | null = null;

  private constructor() {}

  /** Routes the page's socket. Must run before the page opens it. */
  static async on(page: Page): Promise<HammerableSocket> {
    const route = new HammerableSocket();

    await page.routeWebSocket(/\/ws(\?|$)/, (socket) => {
      route.connectedAt.push(Date.now());
      const server = socket.connectToServer();

      // A handler here stops the automatic forwarding of messages, so it forwards them itself; the
      // closure is still forwarded as it came — the page has to see the server's own `4429`.
      server.onMessage((message) => {
        route.fromServer.push({ at: Date.now(), frame: JSON.parse(String(message)) as Envelope });
        socket.send(message);
      });

      route.server = server;
    });

    return route;
  }

  /**
   * Sends `count` frames to the server as the page, as fast as they go.
   *
   * Well-formed envelopes of a command no server has, on purpose: the rate is counted before a
   * frame is decoded, so they cost what any command costs, and one the server does not know cannot
   * do anything by accident on the way. Not garbage — a frame without the protocol version is
   * closed with `4426` at once, and the rate would never be reached.
   */
  hammer(count: number): void {
    const server = this.server;
    if (server === null) {
      throw new Error('the page has not opened its socket yet');
    }

    for (let index = 0; index < count; index += 1) {
      server.send(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          id: randomUUID(),
          kind: 'command',
          type: 'e2e.hammer',
          ts: new Date().toISOString(),
          traceId: randomUUID(),
          payload: { index },
        } satisfies Envelope),
      );
    }
  }

  /** The first frame from the server that matches, with when it arrived. */
  firstFromServer(
    match: (frame: Envelope) => boolean,
  ): { at: number; frame: Envelope } | undefined {
    return this.fromServer.find((entry) => match(entry.frame));
  }
}
