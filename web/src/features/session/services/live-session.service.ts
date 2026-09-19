import type { Envelope } from '@remote-claude/contracts';

import type { WsClient } from '@/shared/api/ws-client';
import { isRecord, readText } from '@/shared/lib/json';
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
} as const;

/** Opens a session on a workspace. @returns whether the command left */
export function startSession(client: WsClient, workspacePath: string): boolean {
  return client.command(SESSION_COMMANDS.start, { workspacePath });
}

/** Sends one turn. A prompt that arrives mid-turn is queued by the backend, never refused. */
export function sendPrompt(client: WsClient, sessionId: string, text: string): boolean {
  return client.command(SESSION_COMMANDS.prompt, { sessionId, text });
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
  const payload = frame.payload ?? {};

  switch (frame.type) {
    // The session is open and nothing is running in it. The backend derives the same thing from
    // the same event; a client that waited for a `session.statusChanged` to learn it would show
    // "starting" until the first fragment of the first answer arrived.
    case 'session.started':
      return { ...state, status: 'idle' };

    case 'session.statusChanged':
      return { ...state, status: statusOf(payload) ?? state.status };

    case 'message.delta':
      return applyDelta(state, payload);

    case 'message.completed':
      return applyCompleted(state, payload);

    case 'tool.started':
      return applyToolStarted(state, payload);

    case 'tool.progress':
      return changeTool(state, payload, (tool) => {
        const chunk = readText(payload, 'chunk');
        return chunk === null ? null : { ...tool, output: tool.output + chunk };
      });

    case 'tool.completed':
      return changeTool(state, payload, (tool) => {
        const status = readText(payload, 'status');

        return status === null || !TOOL_OUTCOMES.has(status)
          ? null
          : { ...tool, status: status as ToolStatus, summary: readText(payload, 'summary') };
      });

    case 'turn.completed':
      return applyTurn(state, payload);

    case 'session.closed':
      return applyClosed(state, payload, frame.ts);

    default:
      return state;
  }
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
  change: (tool: ToolExecution) => ToolExecution | null,
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

/** The five reasons the contract carries. */
const CLOSE_REASONS = new Set<string>([
  'closedByUser',
  'completed',
  'failed',
  'auditUnavailable',
  'shutdown',
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
