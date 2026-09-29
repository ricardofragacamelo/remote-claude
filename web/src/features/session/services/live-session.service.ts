import type { Envelope } from '@remote-claude/contracts';

import { toAppError } from '@/shared/api/errors';
import type { AppError } from '@/shared/api/errors';
import type { WsClient } from '@/shared/api/ws-client';
import { isRecord, readText } from '@/shared/lib/json';
import type { HistoryEvent } from '../types/history';
import type {
  Conversation,
  SessionCloseReason,
  SessionStatus,
  StreamMessage,
  ToolExecution,
  ToolStatus,
} from '../types/live-session';

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

/** A conversation nothing has been said in. What a history is folded onto. */
export const SILENT: Conversation = {
  status: 'idle',
  messages: [],
  tools: [],
  lastTurn: null,
  ending: null,
};

/**
 * A conversation, rebuilt from its history — through the very reducer the live stream uses.
 *
 * The history carries the payloads of the live contract without the envelope; wrapping each one
 * back is all it takes for {@link readEvent} to read it, which is the point of B-03: one reducer, and
 * no second copy of it to fall behind.
 */
export function conversationFrom(events: readonly HistoryEvent[]): Conversation {
  return events.reduce(
    (state, event) =>
      readEvent(state, {
        v: 1,
        id: 'history',
        kind: 'event',
        type: event.type,
        ts: '',
        payload: event.payload,
      }),
    SILENT,
  );
}

/**
 * The live conversation with its history laid underneath.
 *
 * The history goes **first** and the live stream stays on top: a message or a tool with the same
 * id is the live one — the stream is the newer of the two — and whatever only the stream has comes
 * after everything the history had. Where the session **is** — its status, its last turn, how it
 * ended — belongs to the stream alone; the history knows nothing of the subprocess.
 *
 * That is what lets the history be reloaded while the stream keeps arriving without a message
 * appearing twice (S-15), and what keeps the history out of the numbering: `seq` is the stream's,
 * and nothing here touches it (S-21).
 */
export function withHistory(live: Conversation, history: readonly HistoryEvent[]): Conversation {
  const past = conversationFrom(history);

  return {
    ...live,
    messages: layered(
      past.messages,
      live.messages,
      (message) => message.messageId,
      // A message the history already has whole is not undone by fragments of it the stream is
      // still delivering: they are older than the whole, not newer.
      (older, newer) => newer.isComplete || !older.isComplete,
    ),
    tools: layered(
      past.tools,
      live.tools,
      (tool) => tool.toolUseId,
      () => true,
    ),
  };
}

/**
 * `under`, with each item `over` also has replaced by it when `replaces` agrees, and the rest of
 * `over` after.
 */
function layered<T>(
  under: readonly T[],
  over: readonly T[],
  idOf: (item: T) => string,
  replaces: (older: T, newer: T) => boolean,
): T[] {
  const newer = new Map(over.map((item) => [idOf(item), item]));
  const known = new Set(under.map(idOf));

  return [
    ...under.map((item) => {
      const replacement = newer.get(idOf(item));
      return replacement !== undefined && replaces(item, replacement) ? replacement : item;
    }),
    ...over.filter((item) => !known.has(idOf(item))),
  ];
}

/** How one event changes the conversation. */
type EventReader = (
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
  frame: Envelope,
) => Conversation;

/**
 * The events the conversation is made of, by type.
 *
 * A `Map` and not an object literal: a frame whose type happens to be `constructor` or `toString`
 * must find nothing here, not something from `Object.prototype`.
 */
const EVENT_READERS: ReadonlyMap<string, EventReader> = new Map<string, EventReader>([
  // The session is open and nothing is running in it. The backend derives the same thing from
  // the same event; a client that waited for a `session.statusChanged` to learn it would show
  // "starting" until the first fragment of the first answer arrived.
  ['session.started', (state) => ({ ...state, status: 'idle' })],
  [
    'session.statusChanged',
    (state, payload) => ({ ...state, status: statusOf(payload) ?? state.status }),
  ],
  ['message.delta', applyDelta],
  ['message.completed', applyCompleted],
  ['tool.started', applyToolStarted],
  ['tool.progress', (state, payload) => changeTool(state, payload, progressOf(payload))],
  ['tool.completed', (state, payload) => changeTool(state, payload, outcomeOf(payload))],
  ['turn.completed', applyTurn],
  ['session.closed', (state, payload, frame) => applyClosed(state, payload, frame.ts)],
]);

/**
 * One frame, applied to the conversation.
 *
 * This is where the shape of the backend stops existing: everything above works with `Conversation`
 * and never with an `Envelope`. It is a pure function of (state, frame), which is what lets every
 * ordering rule be tested without a socket, a store or a component.
 *
 * **An unknown event returns the state unchanged.** The same survival rule the backend applies to
 * an unknown `SDKMessage`: a published client has to keep working when the contract gains an event
 * it has never heard of.
 */
export function readEvent(state: Conversation, frame: Envelope): Conversation {
  const read = EVENT_READERS.get(frame.type);

  return read === undefined ? state : read(state, frame.payload ?? {}, frame);
}

/** The statuses the contract carries. An unknown one leaves the status where it was. */
const STATUSES = new Set<string>([
  'starting',
  'idle',
  'thinking',
  'running',
  'waitingPermission',
  'closed',
]);

function statusOf(payload: Readonly<Record<string, unknown>>): SessionStatus | null {
  const status = payload['status'];

  return typeof status === 'string' && STATUSES.has(status) ? (status as SessionStatus) : null;
}

/**
 * A fragment, accumulated **by `messageId`**.
 *
 * The rule the whole store exists for: two messages in flight must not mix. A delta for a message
 * nothing has announced yet starts one, because the SDK streams before it completes anything.
 */
function applyDelta(state: Conversation, payload: Readonly<Record<string, unknown>>): Conversation {
  const messageId = readText(payload, 'messageId');
  const delta = readText(payload, 'delta');

  if (messageId === null || delta === null) {
    return state;
  }

  const existing = state.messages.find((message) => message.messageId === messageId);

  if (existing === undefined) {
    const started: StreamMessage = { messageId, role: 'assistant', text: delta, isComplete: false };
    return { ...state, messages: [...state.messages, started] };
  }

  // A completed message is never re-opened by a late fragment: `message.completed` is the whole
  // message, and a delta arriving after it would append text the server has already superseded.
  if (existing.isComplete) {
    return state;
  }

  return {
    ...state,
    messages: state.messages.map((message) =>
      message.messageId === messageId ? { ...message, text: message.text + delta } : message,
    ),
  };
}

/**
 * The finished message, which **replaces** what the deltas accumulated.
 *
 * Replaces rather than appends: a client that missed a fragment is made whole here, and one that
 * missed none gets the same text it already had.
 */
function applyCompleted(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
): Conversation {
  const messageId = readText(payload, 'messageId');
  const role = readText(payload, 'role');

  if (messageId === null) {
    return state;
  }

  const blocks = Array.isArray(payload['content']) ? payload['content'] : [];
  const whole = blocks
    .map((block) => (isRecord(block) ? (readText(block, 'text') ?? '') : ''))
    .join('');

  const completed: StreamMessage = {
    messageId,
    role: role === 'user' ? 'user' : 'assistant',
    text: whole,
    isComplete: true,
  };

  const known = state.messages.some((message) => message.messageId === messageId);

  return {
    ...state,
    messages: known
      ? state.messages.map((message) => (message.messageId === messageId ? completed : message))
      : [...state.messages, completed],
  };
}

function applyToolStarted(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
): Conversation {
  const toolUseId = readText(payload, 'toolUseId');
  const toolName = readText(payload, 'toolName');

  if (toolUseId === null || toolName === null) {
    return state;
  }

  const started: ToolExecution = {
    toolUseId,
    toolName,
    input: isRecord(payload['input']) ? payload['input'] : {},
    status: 'running',
    output: '',
    summary: null,
  };

  return { ...state, tools: [...withoutTool(state, toolUseId), started] };
}

/** A `tool.progress`: the chunk appended to what the tool has written so far. */
function progressOf(payload: Readonly<Record<string, unknown>>): ToolChange {
  return (tool) => {
    const chunk = readText(payload, 'chunk');
    return chunk === null ? null : { ...tool, output: tool.output + chunk };
  };
}

/** A `tool.completed`: how the tool ended, when it is an outcome the contract carries. */
function outcomeOf(payload: Readonly<Record<string, unknown>>): ToolChange {
  return (tool) => {
    const status = readText(payload, 'status');

    return status === null || !TOOL_OUTCOMES.has(status)
      ? null
      : { ...tool, status: status as ToolStatus, summary: readText(payload, 'summary') };
  };
}

/** A change to one tool, or `null` when the payload is not one and the tool stays as it was. */
type ToolChange = (tool: ToolExecution) => ToolExecution | null;

/** The three outcomes the contract carries. Anything else leaves the tool where it was. */
const TOOL_OUTCOMES = new Set<string>(['succeeded', 'failed', 'denied']);

/**
 * A change to the tool a payload names, or the state untouched.
 *
 * One function for progress and for the outcome, because they are the same three steps — find the
 * invocation, check the payload is one, replace that entry — and the copy that is not written
 * every day is the one that forgets a guard.
 */
function changeTool(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
  change: ToolChange,
): Conversation {
  const toolUseId = readText(payload, 'toolUseId');

  if (toolUseId === null) {
    return state;
  }

  const changed = state.tools.map((tool) =>
    tool.toolUseId === toolUseId ? (change(tool) ?? tool) : tool,
  );

  return { ...state, tools: changed };
}

function applyTurn(state: Conversation, payload: Readonly<Record<string, unknown>>): Conversation {
  const turnId = readText(payload, 'turnId');
  const costUsd = readText(payload, 'costUsd');
  const durationMs = payload['durationMs'];

  if (turnId === null || costUsd === null || typeof durationMs !== 'number') {
    return state;
  }

  return { ...state, lastTurn: { turnId, costUsd, durationMs } };
}

/** The six reasons the contract carries. */
const CLOSE_REASONS = new Set<string>([
  'closedByUser',
  'completed',
  'failed',
  'auditUnavailable',
  'shutdown',
  'idleTimeout',
]);

function applyClosed(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
  at: string,
): Conversation {
  const reason = readText(payload, 'reason');

  if (reason === null || !CLOSE_REASONS.has(reason)) {
    return state;
  }

  return {
    ...state,
    status: 'closed',
    ending: { reason: reason as SessionCloseReason, at },
  };
}

/** The tools of a session, without one — so a redelivered `tool.started` replaces rather than duplicates. */
function withoutTool(state: Conversation, toolUseId: string): readonly ToolExecution[] {
  return state.tools.filter((tool) => tool.toolUseId !== toolUseId);
}
