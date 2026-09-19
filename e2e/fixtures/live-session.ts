import fs from 'node:fs';
import path from 'node:path';

import { expect } from '@playwright/test';
import type { Envelope } from '@remote-claude/contracts';

import type { Browser } from '@playwright/test';

import { environment } from './environment';
import { signIn } from './auth';
import { E2eSocket } from './ws';
import type { AuthenticatedUser } from './auth';
import type { ScenarioUser } from '../scenarios';

/**
 * Driving a live session from outside the application.
 *
 * Nothing here imports `web/src` or `backend/src`: the point of this level is that the **contract**
 * works for anybody who speaks it, and a helper that reached into either end would be an
 * integration test wearing an end-to-end test's clothes.
 */

/** Everything a live-session suite needs before its first case. */
export interface LiveSessionContext {
  readonly user: AuthenticatedUser;

  /** A root this user may open, as the HTTP API lists them. */
  readonly workspace: string;
}

/**
 * Signs in and finds a workspace, through the doors a person uses.
 *
 * The allowlist is the first line of defence of the product, and the root is read from the API
 * rather than assumed from whatever the stack happened to declare — a suite that hard-coded a
 * path would pass on a stack whose allowlist said something else entirely.
 *
 * @throws {Error} when this user may open nothing, which makes every case below meaningless
 */
export async function openWorkspace(
  browser: Browser,
  user: ScenarioUser,
): Promise<LiveSessionContext> {
  const signedIn = await signIn(browser, user);

  const response = await fetch(`${environment.backendUrl}/workspaces`, {
    headers: { authorization: `Bearer ${signedIn.accessToken}` },
  });

  const roots = (await response.json()) as { workspaces: readonly WorkspaceRoot[] };
  const workspace = roots.workspaces[0]?.path;

  if (workspace === undefined) {
    throw new Error('the allowlist of this stack gives this user no root to open');
  }

  return { user: signedIn, workspace };
}

/** Opens an authenticated socket for a user the suite has already signed in. */
export async function connected(user: AuthenticatedUser): Promise<E2eSocket> {
  const socket = await E2eSocket.open();
  await socket.authenticate(user.accessToken);
  return socket;
}

/** The workspaces this user may open, as the HTTP API lists them. */
export interface WorkspaceRoot {
  readonly path: string;
  readonly label: string;
}

/** Opens a session on a workspace and answers the id the **server** minted for it. */
export async function startSession(socket: E2eSocket, workspacePath: string): Promise<string> {
  socket.send('session.start', { workspacePath });

  const started = await socket.waitFor((frame) => frame.type === 'session.started');
  const sessionId = (started.payload as { sessionId?: unknown }).sessionId;

  expect(typeof sessionId).toBe('string');
  return String(sessionId);
}

/**
 * Sends a turn, naming the recording the scripted backend should replay.
 *
 * The tag is a control of the fake and of nothing else — the real SDK has never heard of it — and
 * it is what lets one running stack cover both the turn that asks for permission and the turn
 * that does not. An end-to-end suite gets one backend per run.
 */
export function prompt(
  socket: E2eSocket,
  sessionId: string,
  fixture: string,
  text = 'do the work',
): void {
  socket.send('session.prompt', { sessionId, text: `${text} [fixture:${fixture}]` });
}

/** Waits for the question the recorded run always asks about, and answers nothing yet. */
export function permissionAsked(socket: E2eSocket): Promise<Envelope> {
  return socket.waitFor((frame) => frame.type === 'permission.requested');
}

/** Waits for the session to report a particular status, whatever else is arriving. */
export function statusReached(socket: E2eSocket, status: string): Promise<Envelope> {
  return socket.waitFor(
    (frame) =>
      frame.type === 'session.statusChanged' &&
      (frame.payload as { status?: string }).status === status,
  );
}

/** What `session.attached` answered: how much was replayed, and whether anything was lost. */
export interface AttachAck {
  readonly replayed: number;
  readonly gap: boolean;
  readonly oldestAvailableSeq: number;
}

/** Attaches to a session from a given point, and answers what the server said about the replay. */
export async function attachFrom(
  socket: E2eSocket,
  sessionId: string,
  resumeFromSeq: number,
): Promise<AttachAck> {
  socket.send('session.attach', { sessionId, resumeFromSeq });

  const attached = await socket.waitFor((frame) => frame.type === 'session.attached');
  return attached.payload as unknown as AttachAck;
}

/**
 * Keeps sending until the session's sequence has gone past `target`.
 *
 * A batch at a time, because one at a time is a round trip per event and minutes of wall clock,
 * and all of them at once is a thousand queries queued on a ten-connection pool.
 *
 * Overflowing the ring is the only honest way to produce a gap: the buffer is what decides, and
 * its size is a property of the server rather than a number a test may assume.
 */
export async function pushPastSeq(
  socket: E2eSocket,
  target: number,
  send: () => void,
  batchSize = 50,
): Promise<void> {
  while (lastSeqOf(socket) < target) {
    for (let index = 0; index < batchSize; index += 1) {
      send();
    }

    const reached = lastSeqOf(socket) + batchSize;
    await socket.waitFor((frame) => (frame.seq ?? 0) >= reached, 60_000);
  }
}

/** The highest sequence this socket has seen. */
export function lastSeqOf(socket: E2eSocket): number {
  return socket.frames.at(-1)?.seq ?? 0;
}

/**
 * Asserts that the buffer recycled what a client had, and that nothing was stitched over the hole.
 *
 * Three assertions together, because separately none of them means anything: `gap` says the server
 * noticed, `replayed` says it sent nothing rather than a partial history, and the oldest sequence
 * says the ring really did move on. A client that believes it has everything and does not is worse
 * than one told to reload.
 */
export function expectRecycledBuffer(
  ack: AttachAck,
  expected: { readonly gap: boolean; readonly replayed: number },
): void {
  expect(ack.gap).toBe(expected.gap);
  expect(ack.replayed).toBe(expected.replayed);
  expect(ack.oldestAvailableSeq).toBeGreaterThan(1);
}

/** The size of the server's replay buffer, as the handshake announced it. */
export function replayBufferSize(socket: E2eSocket): number {
  const ready = socket.frames.find((frame) => frame.type === 'connection.ready');

  return (ready?.payload as { limits: { replayBufferSize: number } }).limits.replayBufferSize;
}

/** The sequences of the events this socket received for a session, in arrival order. */
export function sequencesOf(socket: E2eSocket, sessionId: string): number[] {
  return socket.frames
    .filter((frame) => frame.kind === 'event' && frame.sessionId === sessionId)
    .map((frame) => frame.seq ?? 0);
}

/** The CLI's configuration of this run, isolated from the developer's own. */
function claudeConfigFile(): string {
  return path.join(environment.claudeConfigDir, '.claude.json');
}

/**
 * Marks a directory as trusted, the way the CLI does when somebody accepts its dialog.
 *
 * Measured on 2026-09-18: in a trusted directory a project `allow` rule is applied and
 * `canUseTool` is **never called** — no error, no warning, nobody asked. The backend clears the
 * mark before it opens a session, and this is what sets it up so that clearing can be observed.
 */
export function markAsTrusted(directory: string): void {
  const file = claudeConfigFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const config = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>)
    : {};

  const projects = (config['projects'] ?? {}) as Record<string, Record<string, unknown>>;
  projects[directory] = { ...projects[directory], hasTrustDialogAccepted: true };
  config['projects'] = projects;

  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/** Whether the CLI would still treat a directory as trusted. */
export function trustMarkOf(directory: string): boolean {
  const file = claudeConfigFile();

  if (!fs.existsSync(file)) {
    return false;
  }

  const config = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    projects?: Record<string, { hasTrustDialogAccepted?: boolean }>;
  };

  return config.projects?.[directory]?.hasTrustDialogAccepted === true;
}
