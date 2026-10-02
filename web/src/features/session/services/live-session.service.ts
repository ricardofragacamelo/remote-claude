import type { Envelope } from '@remote-claude/contracts';

import { toAppError } from '@/shared/api/errors';
import type { AppError } from '@/shared/api/errors';
import type { WsClient } from '@/shared/api/ws-client';
import { readText } from '@/shared/lib/json';

/** The commands that drive a session. Names of the contract, in one place. */
export const SESSION_COMMANDS = {
  start: 'session.start',
  prompt: 'session.prompt',
  interrupt: 'session.interrupt',
  setModel: 'session.setModel',
  setPermissionMode: 'session.setPermissionMode',
  close: 'session.close',
  rewindFiles: 'session.rewindFiles',
} as const;

/**
 * Opens a session on a workspace.
 *
 * The id is kept because a start can be refused — the machine at its ceiling
 * (`SESSION_LIMIT_REACHED`), a folder no longer allowed — and the refusal names the command it
 * refuses by that id, in `correlationId`. A screen that could not tell would wait for ever.
 *
 * @returns the id of the command frame, or `null` when the socket was not ready and nothing left
 */
export function startSession(client: WsClient, workspacePath: string): string | null {
  return client.issue(SESSION_COMMANDS.start, { workspacePath });
}

/**
 * Sends one turn. A prompt that arrives mid-turn is queued by the backend, never refused for that.
 *
 * A slash command is a prompt like any other (`"/init"`), and one the installation does not have
 * is refused before it reaches Claude — with an `error` naming this frame in `correlationId`.
 *
 * @returns the id of the command frame, or `null` when the socket was not ready and nothing left
 */
export function sendPrompt(client: WsClient, sessionId: string, text: string): string | null {
  return client.issue(SESSION_COMMANDS.prompt, { sessionId, text });
}

/**
 * The refusal of **one** command in a frame, or `null` when the frame refuses something else.
 *
 * A command that failed is answered with an `error` whose `correlationId` is the id of its frame,
 * and that id is the only thing that tells a refusal of mine from everything else on the socket.
 */
export function refusalOf(frame: Envelope, commandId: string): AppError | null {
  return frame.kind === 'error' && frame.correlationId === commandId
    ? toAppError({ error: frame.payload }, frame.traceId ?? commandId)
    : null;
}

/** Interrupts the turn that is running. */
export function interruptSession(client: WsClient, sessionId: string): boolean {
  return client.command(SESSION_COMMANDS.interrupt, { sessionId });
}

/** Changes the model of a running session. */
export function setSessionModel(client: WsClient, sessionId: string, model: string): boolean {
  return client.command(SESSION_COMMANDS.setModel, { sessionId, model });
}

/** Changes how the SDK treats tool invocations. */
export function setSessionPermissionMode(
  client: WsClient,
  sessionId: string,
  mode: string,
): boolean {
  return client.command(SESSION_COMMANDS.setPermissionMode, { sessionId, mode });
}

/** Ends a session and releases its subprocess. Only its owner may. */
export function closeSession(client: WsClient, sessionId: string): boolean {
  return client.command(SESSION_COMMANDS.close, { sessionId });
}

/**
 * Continues a conversation of the history, in the workspace it ran in.
 *
 * @returns the id of the command frame — what the answer to it is recognised by — or `null` when
 *   the socket was not ready and nothing left
 */
export function resumeSession(
  client: WsClient,
  workspacePath: string,
  conversationId: string,
): string | null {
  return client.issue(SESSION_COMMANDS.start, { workspacePath, resumeSessionId: conversationId });
}

/** What answered a resume: the session to go to, or why there is none. */
export type ResumeAnswer =
  | { readonly kind: 'resumed'; readonly sessionId: string }
  | { readonly kind: 'refused'; readonly error: AppError };

/**
 * The answer to **this** resume in a frame, or `null` when the frame answers something else.
 *
 * Three frames answer one, and which of them is the server's call:
 *
 * - `session.started` of a session that continues the conversation — it was opened;
 * - `session.attached` naming it — it was already live, and resuming what is live is an attach
 *   (S-24). Recognised by the conversation, because an ack for a session nobody watches carries no
 *   other way to say whose it is;
 * - an `error` whose `correlationId` is the command's — refused: gone, outside the allowlist, or
 *   beyond the limit of the installation (B-13).
 *
 * Either id of the conversation counts: a fork is a new one that **continues** the requested id,
 * and one of ours continued in place **is** it.
 */
export function resumeAnswer(
  frame: Envelope,
  request: { readonly conversationId: string; readonly commandId: string },
): ResumeAnswer | null {
  if (frame.kind === 'error') {
    const error = refusalOf(frame, request.commandId);
    return error === null ? null : { kind: 'refused', error };
  }

  if (frame.type !== 'session.started' && frame.type !== 'session.attached') {
    return null;
  }

  const payload = frame.payload ?? {};
  const sessionId = readText(payload, 'sessionId');
  const continues = [readText(payload, 'claudeSessionId'), readText(payload, 'resumedFrom')];

  return sessionId !== null && continues.includes(request.conversationId)
    ? { kind: 'resumed', sessionId }
    : null;
}

/**
 * Which conversation of Claude a `session.started` is, and which one it continues.
 *
 * `null` for any other frame. The live session id and the conversation id are different things —
 * the first names a subprocess and dies with it, the second names Claude's file — and the history
 * is only ever read by the second.
 */
export function conversationOfStart(
  frame: Envelope,
): { readonly claudeSessionId: string | null; readonly resumedFrom: string | null } | null {
  if (frame.type !== 'session.started') {
    return null;
  }

  const payload = frame.payload ?? {};

  return {
    claudeSessionId: readText(payload, 'claudeSessionId'),
    resumedFrom: readText(payload, 'resumedFrom'),
  };
}

export {
  conversationFrom,
  readEvent,
  sessionCostOf,
  SILENT,
  withHistory,
} from './conversation-reducer';
