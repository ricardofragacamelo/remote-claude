import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Envelope } from '@remote-claude/contracts';
import type { Page, WebSocketRoute } from '@playwright/test';

import { callApi } from './api';
import { openSignedIn } from './auth';
import { attachFrom, closeSession, connected, prompt } from './live-session';
import type { AuthenticatedUser } from './auth';
import type { E2eSocket } from './ws';
import type { ScenarioUser } from '../scenarios';

/**
 * Conversations, their history and the files they wrote, from the outside — plan 04, F5.
 *
 * The scripted backend is **one** Claude: what it replays it writes to its store of conversations,
 * as `persistSession: true` does, and the files a recording wrote it writes in the directory the
 * session runs in. So what these helpers read back — a transcript, a file on disk — is what the
 * product itself produced during the run, never something a test planted.
 */

/** A session opened by the suite: the live stream, and the conversation it is. */
export interface OpenedConversation {
  readonly sessionId: string;
  readonly conversationId: string;
}

/**
 * Opens a session and answers both of its ids: the live one, and the conversation's.
 *
 * The conversation id comes from `session.started`, the only frame that says it before a gap: it is
 * what the history is read by and what a resume accepts.
 */
export async function startConversation(
  socket: E2eSocket,
  workspacePath: string,
): Promise<OpenedConversation> {
  const mark = socket.frames.length;
  socket.send('session.start', { workspacePath });

  const started = await socket.waitFor(
    (frame) => socket.frames.indexOf(frame) >= mark && frame.type === 'session.started',
  );
  const payload = started.payload as { sessionId?: unknown; claudeSessionId?: unknown };

  expect(typeof payload.sessionId).toBe('string');
  expect(typeof payload.claudeSessionId).toBe('string');

  return { sessionId: String(payload.sessionId), conversationId: String(payload.claudeSessionId) };
}

/**
 * Sends one turn and waits for it to end, answering the frames the turn produced.
 *
 * Only the frames after the prompt: a socket that already saw a turn of this session would otherwise
 * answer the old `turn.completed` at once.
 */
export async function completedTurn(
  socket: E2eSocket,
  sessionId: string,
  fixture: string,
  text?: string,
): Promise<readonly Envelope[]> {
  const mark = socket.frames.length;
  prompt(socket, sessionId, fixture, text);

  await socket.waitFor(
    (frame) =>
      socket.frames.indexOf(frame) >= mark &&
      frame.type === 'turn.completed' &&
      frame.sessionId === sessionId,
    30_000,
  );

  return socket.frames.slice(mark);
}

/**
 * Waits until a socket has seen `count` frames of `type`, however many frames that takes.
 *
 * Counted incrementally, and never by filtering every frame on every frame: a wait that rescans
 * a socket holding thousands of frames, once per frame, blocks the test's event loop long enough
 * for the socket to miss the server's heartbeat — and be closed with `4408` for it.
 */
export function framesCounted(
  socket: E2eSocket,
  type: string,
  count: number,
  timeoutMs: number,
): Promise<Envelope> {
  let scanned = 0;
  let seen = 0;

  return socket.waitFor(() => {
    for (; scanned < socket.frames.length; scanned += 1) {
      if (socket.frames[scanned]?.type === type) {
        seen += 1;
      }
    }
    return seen >= count;
  }, timeoutMs);
}

/**
 * Ends a session from a socket of its own — one that opened nothing, as a screen that resumed a
 * conversation leaves the suite holding.
 *
 * Attached first: `session.closed` goes to whoever watches the session, and a socket that only sent
 * the command would wait for an event that is never addressed to it.
 */
export async function endSession(user: AuthenticatedUser, sessionId: string): Promise<void> {
  const socket = await connected(user);
  await attachFrom(socket, sessionId, 0);
  await closeSession(socket, sessionId);
}

/** One page of a conversation, as `GET /transcripts/:id/messages` answers it. */
export interface TranscriptPage {
  readonly events: readonly { readonly type: string; readonly payload: Record<string, unknown> }[];
  readonly nextCursor: string | null;
  readonly conversation: { readonly cwd: string; readonly origin: string };
}

/** Reads the latest page of a conversation — as a browser, or as the phone [installId] is. */
export async function transcriptOf(
  user: AuthenticatedUser,
  conversationId: string,
  installId?: string,
): Promise<TranscriptPage> {
  const response = await callApi(user, `/transcripts/${conversationId}/messages`, {
    ...(installId === undefined ? {} : { installId }),
  });

  expect(response.status).toBe(200);
  return (await response.json()) as TranscriptPage;
}

/** The text of every message of a page, in order, by role. */
export function said(page: TranscriptPage, role: 'user' | 'assistant'): string[] {
  return page.events
    .filter((event) => event.type === 'message.completed' && event.payload['role'] === role)
    .map((event) =>
      ((event.payload['content'] as { text?: string }[] | undefined) ?? [])
        .map((block) => block.text ?? '')
        .join(''),
    );
}

/**
 * A folder of its own inside the allowlist, for the length of one test, and gone after it.
 *
 * Its own because these tests write — the replay writes what the recording wrote, and an undo puts
 * it back — and two tests writing `summary.md` into one root would be testing each other. The root
 * is read from the API, as every spec does, and only the folder under it is made here: the backend
 * admits any directory inside a root it declares.
 *
 * Registers its own `afterEach`, so it is called at the top level of a spec.
 *
 * @returns a function that makes one, under the root given
 */
export function scratchFolders(): (root: string) => string {
  const made: string[] = [];

  test.afterEach(() => {
    for (const folder of made.splice(0)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  return (root) => {
    const folder = path.join(root, `e2e-${randomUUID()}`);
    fs.mkdirSync(folder);
    made.push(folder);
    return folder;
  };
}

/** Opens the screen of a live session in the browser, signed in, and waits for its socket. */
export async function sessionScreen(
  page: Page,
  user: ScenarioUser,
  sessionId: string,
): Promise<void> {
  await openSignedIn(page, user, `/sessions/${sessionId}`);
  await expect(page.getByText('Connected', { exact: true }).first()).toBeVisible();
}

/** The messages on a screen — the session's, or the history's — one list item each. */
export function messagesOn(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('list', { name: 'Conversation' }).getByRole('listitem');
}

/** The question on screen about one tool — its card in the permission queue. */
export function cardFor(page: Page, toolName: string): ReturnType<Page['getByRole']> {
  return page.getByRole('listitem', { name: `Permission for ${toolName}` });
}

/** Writes a prompt into the screen's box and sends it, the way a person does. */
export async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Prompt').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

/**
 * The browser's socket, behind a switch the test holds.
 *
 * Playwright's own network emulation does not cut a WebSocket that is already open, and the one
 * thing a `gap` exists for is the connection that went away. So the page's socket is routed
 * through the test: forwarded to the backend untouched while the switch is on, cut when it is
 * thrown, and refused while it stays off — the client's reconnects included, which is what keeps
 * it away long enough for the buffer to move on.
 */
export class SwitchableSocket {
  /** Each open connection, as its two halves: the page's, and the one to the backend. */
  private readonly live = new Set<{ page: WebSocketRoute; server: WebSocketRoute }>();
  private readonly fromServer: Envelope[] = [];
  private down = false;

  private constructor() {}

  /** Routes the page's socket through the switch. Must run before the page opens it. */
  static async on(page: Page): Promise<SwitchableSocket> {
    const route = new SwitchableSocket();

    await page.routeWebSocket(/\/ws(\?|$)/, (socket) => {
      if (route.down) {
        // Not a close frame the client could take for a goodbye: any code but 1000 is a drop, and
        // a drop is what it reconnects from.
        void socket.close({ code: 4000, reason: 'e2e: network down' });
        return;
      }

      const server = socket.connectToServer();

      // Read on the way through, and handed on untouched: what the page was told is what the test
      // asserts on, and a handler here is what stops the automatic forwarding.
      server.onMessage((message) => {
        route.fromServer.push(JSON.parse(String(message)) as Envelope);
        socket.send(message);
      });

      route.live.add({ page: socket, server });
    });

    return route;
  }

  /** Every `session.attached` the backend answered the page with, in order. */
  get attachAcks(): readonly Envelope[] {
    return this.fromServer.filter((frame) => frame.type === 'session.attached');
  }

  /** Drops the connection that is open, and refuses every reconnect until {@link restore}. */
  async cut(): Promise<void> {
    this.down = true;

    // Both halves: the page has to see a drop, and the backend has to stop counting a connection
    // that nothing is listening to any more.
    for (const { page, server } of this.live) {
      await page.close({ code: 4000, reason: 'e2e: network down' });
      await server.close({ code: 4000, reason: 'e2e: network down' });
    }
    this.live.clear();
  }

  /** Lets the next reconnect through. */
  restore(): void {
    this.down = false;
  }
}
