import type { Envelope } from '@remote-claude/contracts';

import { isRecord, readText } from '@/shared/lib/json';
import { isTurnRunning } from '../lib/turn';
import type { HistoryEvent } from '../types/history';
import { readToolQuestion } from './tool-question';
import type {
  BlockKind,
  Conversation,
  MessageBlock,
  SessionCloseReason,
  SessionStatus,
  StreamMessage,
  TimelineEntry,
  ToolExecution,
  ToolStatus,
  TurnSummary,
  TurnUsage,
} from '../types/live-session';

/** A conversation nothing has been said in. What a history is folded onto. */
export const SILENT: Conversation = {
  status: 'idle',
  messages: [],
  tools: [],
  timeline: [],
  turns: [],
  lastTurn: null,
  ending: null,
  turnSince: null,
};

/** How one event changes the conversation. */
type EventReader = (
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
  frame: Envelope,
) => Conversation;

/** How an event about one message changes the conversation, given the message and the instant. */
type MessageReader = (
  state: Conversation,
  messageId: string,
  payload: Readonly<Record<string, unknown>>,
  at: string,
) => Conversation;

/** The reader of an event about one message: a payload that names no message changes nothing. */
function aboutMessage(read: MessageReader): EventReader {
  return (state, payload, frame) => {
    const messageId = readText(payload, 'messageId');
    return messageId === null ? state : read(state, messageId, payload, frame.ts);
  };
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
  const read = EVENT_READERS.get(frame.type);

  if (read === undefined) {
    return state;
  }

  const payload = frame.payload ?? {};
  const next = read(state, payload, frame);
  const at = readText(payload, 'at');

  // An event of the history says when its entry was written: the next thinking is measured from it.
  return at === null ? next : { ...next, writtenAt: at };
}

/**
 * A conversation, rebuilt from its history — through the very reducer the live stream uses.
 *
 * The history carries the payloads of the live contract without the envelope; wrapping each one
 * back is all it takes for {@link readEvent} to read it, which is the point of B-03: one reducer, and
 * no second copy of it to fall behind. Thinking, subagents and the end of each turn come back the
 * way they were drawn live (plan 08, S-84).
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
 * The history goes **first** and the live stream stays on top: a message, a tool or a turn with the
 * same id is the live one — the stream is the newer of the two — and whatever only the stream has
 * comes after everything the history had. Where the session **is** — its status, its last turn, how
 * it ended — belongs to the stream alone; the history knows nothing of the subprocess.
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
    tools: layered(past.tools, live.tools, (tool) => tool.toolUseId, always),
    timeline: layered(past.timeline, live.timeline, (entry) => `${entry.kind}:${entry.id}`, always),
    turns: layered(past.turns, live.turns, (turn) => turn.turnId, always),
  };
}

function always(): boolean {
  return true;
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
 * Where the session stands, and since when its turn runs (plan 09, B-21): the instant, by the
 * server's clock, the status first left rest — kept while it moves between thinking, running a tool
 * and waiting on a person, and dropped once the turn is over. A replay re-delivers the same frame,
 * so it lands on the same instant; the history carries no instant, and so starts no clock.
 */
function applyStatus(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
  frame: Envelope,
): Conversation {
  const status = statusOf(payload) ?? state.status;
  const since = state.turnSince ?? (frame.ts === '' ? null : frame.ts);

  return { ...state, status, turnSince: isTurnRunning(status) ? since : null };
}

/** The subagent a payload belongs to, or `null` for the main conversation. */
function parentOf(payload: Readonly<Record<string, unknown>>): string | null {
  return readText(payload, 'parentToolUseId');
}

/** The timeline with one more entry — unless it already has that one, which a redelivery is. */
function appended(
  timeline: readonly TimelineEntry[],
  entry: TimelineEntry,
): readonly TimelineEntry[] {
  return timeline.some((each) => each.kind === entry.kind && each.id === entry.id)
    ? timeline
    : [...timeline, entry];
}

/** The text of a message as it reads now: the finished text blocks, and the one streaming. */
function textOf(blocks: readonly MessageBlock[], streaming: StreamMessage['streaming']): string {
  const finished = blocks.filter((block) => block.kind === 'text').map((block) => block.text);
  const live = streaming?.kind === 'text' ? [streaming.text] : [];

  return [...finished, ...live].join('');
}

/** A message nothing has been said in yet, opened by the first thing that names it. */
function aMessage(
  messageId: string,
  role: StreamMessage['role'],
  parentToolUseId: string | null,
): StreamMessage {
  return {
    messageId,
    role,
    text: '',
    blocks: [],
    streaming: null,
    isComplete: false,
    parentToolUseId,
    thinkingMs: null,
    thinkingSince: null,
  };
}

/** Milliseconds between two instants of the server — `null` when either is not one (the history). */
function between(since: string | null, until: string): number | null {
  const from = since === null ? Number.NaN : Date.parse(since);
  const to = Date.parse(until);

  return Number.isNaN(from) || Number.isNaN(to) ? null : Math.max(0, to - from);
}

/**
 * Milliseconds from the entry before to this one, by the instants the history wrote them — an upper
 * bound of what happened between them (plan 22, D-14). `null` without both instants, and when this
 * one was written first: a prompt that waited in the queue is read after a result it predates (S-21),
 * and a duration below zero is no duration.
 */
function upperBound(since: string | undefined, until: string | null): number | null {
  const from = since === undefined ? Number.NaN : Date.parse(since);
  const to = until === null ? Number.NaN : Date.parse(until);

  return Number.isNaN(from) || Number.isNaN(to) || to < from ? null : to - from;
}

/**
 * When thinking stops, by the clock of the frame that stopped it — a fragment of the answer, or the
 * thinking block finishing. Once only: the first measure is the true one.
 */
function thoughtUntil(message: StreamMessage, at: string): Partial<StreamMessage> {
  return message.thinkingSince === null || message.thinkingMs !== null
    ? {}
    : { thinkingMs: between(message.thinkingSince, at) };
}

/** The message a fragment adds to, with the fragment in it. */
function withFragment(
  message: StreamMessage,
  kind: 'text' | 'thinking',
  delta: string,
  at: string,
): StreamMessage {
  const continues = message.streaming?.kind === kind;
  const streaming = { kind, text: continues ? `${message.streaming?.text ?? ''}${delta}` : delta };
  const thinking =
    kind === 'thinking'
      ? { thinkingSince: message.thinkingSince ?? (at === '' ? null : at) }
      : thoughtUntil(message, at);

  return {
    ...message,
    ...thinking,
    streaming,
    isComplete: false,
    text: textOf(message.blocks, streaming),
  };
}

/**
 * A fragment, accumulated **by `messageId`**, into the block it says it is part of.
 *
 * The rule the whole store exists for: two messages in flight must not mix. A delta for a message
 * nothing has announced yet starts one, because the SDK streams before it completes anything. A
 * fragment of thinking goes to a thinking block, never into the answer (plan 08, D-17).
 */
const applyDelta: MessageReader = (state, messageId, payload, at) => {
  const delta = readText(payload, 'delta');

  if (delta === null) {
    return state;
  }

  const kind = readText(payload, 'blockType') === 'thinking' ? 'thinking' : 'text';
  const existing = state.messages.find((message) => message.messageId === messageId);
  const base = existing ?? aMessage(messageId, 'assistant', parentOf(payload));
  const changed = withFragment(base, kind, delta, at);

  return withMessage(state, changed);
};

/**
 * The conversation with a message in it: in its place when it was there, after the rest when it is
 * new — every other message kept as it was, which is what lets each be drawn again only when it
 * changed (S-64).
 */
function withMessage(state: Conversation, changed: StreamMessage): Conversation {
  const id = changed.messageId;
  const known = state.messages.some((message) => message.messageId === id);

  return {
    ...state,
    messages: known
      ? state.messages.map((message) => (message.messageId === id ? changed : message))
      : [...state.messages, changed],
    timeline: appended(state.timeline, { kind: 'message', id }),
  };
}

/** The kinds of block a message is drawn with, by the `type` the contract carries. */
const BLOCK_KINDS: ReadonlyMap<string, BlockKind> = new Map([
  ['text', 'text'],
  ['thinking', 'thinking'],
  ['redacted_thinking', 'redactedThinking'],
  ['image', 'image'],
]);

/** What an image block says of itself: its type and its size — the bytes never travel (D-09). */
function imageOf(block: Readonly<Record<string, unknown>>): Partial<MessageBlock> {
  const mediaType = readText(block, 'mediaType');
  const size = block['size'];

  return {
    ...(mediaType === null ? {} : { mediaType }),
    ...(typeof size === 'number' && Number.isFinite(size) && size >= 0 ? { size } : {}),
  };
}

/**
 * The blocks of a finished message that are drawn as text, as thinking or as the marker of an image
 * — a tool's are drawn as the tool.
 *
 * @param atMostMs how long, at most, a thinking of it took — read off the history (D-14), `null` live
 */
function blocksOf(
  payload: Readonly<Record<string, unknown>>,
  atMostMs: number | null,
): MessageBlock[] {
  const content = Array.isArray(payload['content']) ? payload['content'] : [];

  return content.flatMap((block): MessageBlock[] => {
    const kind = isRecord(block) ? BLOCK_KINDS.get(String(block['type'])) : undefined;

    if (kind === undefined || !isRecord(block)) {
      return [];
    }

    const text = kind === 'thinking' ? readText(block, 'thinking') : readText(block, 'text');
    const blockId = readText(block, 'blockId');
    return [
      {
        kind,
        text: text ?? '',
        ...(blockId === null ? {} : { blockId }),
        ...(kind === 'thinking' && atMostMs !== null ? { atMostMs } : {}),
        ...(kind === 'image' ? imageOf(block) : {}),
      },
    ];
  });
}

/**
 * Whether two blocks are the same block: by identity when both carry one — two thinkings the model
 * did not show are equal in kind and text and still two (plan 22, S-35) —, and by what they say when
 * either comes from a server older than the identity (S-37).
 */
function sameBlock(left: MessageBlock, right: MessageBlock): boolean {
  if (left.blockId !== undefined && right.blockId !== undefined) {
    return left.blockId === right.blockId;
  }

  return (
    left.kind === right.kind &&
    left.text === right.text &&
    left.mediaType === right.mediaType &&
    left.size === right.size
  );
}

/**
 * The finished blocks of a message, added to what it has — once each.
 *
 * The CLI finishes a message one block at a time under one id, so a `message.completed` **adds**
 * its blocks; it replaced them until plan 08, and an answer with a tool after it lost its text when
 * the tool's block arrived. A block the message already has is not added twice: that is the history
 * and the stream both delivering it.
 */
function mergedBlocks(
  have: readonly MessageBlock[],
  arriving: readonly MessageBlock[],
): readonly MessageBlock[] {
  const fresh = arriving.filter((block) => !have.some((each) => sameBlock(each, block)));

  return [...have, ...fresh];
}

/** The fragment a finished block makes whole: gone when the block that finished is its kind. */
function streamingAfter(
  streaming: StreamMessage['streaming'],
  finished: readonly MessageBlock[],
): StreamMessage['streaming'] {
  const kinds = new Set<string>(finished.map((block) => block.kind));

  return streaming !== null && kinds.has(streaming.kind) ? null : streaming;
}

/**
 * A finished message — or, from the CLI, a finished block of one.
 *
 * A client that missed a fragment is made whole here: the block that finished replaces the fragment
 * that was streaming it, and one that missed none gets the same text it already had.
 */
const applyCompleted: MessageReader = (state, messageId, payload, at) => {
  const role = readText(payload, 'role') === 'user' ? 'user' : 'assistant';
  const existing =
    state.messages.find((message) => message.messageId === messageId) ??
    aMessage(messageId, role, parentOf(payload));
  const arriving = blocksOf(payload, upperBound(state.writtenAt, readText(payload, 'at')));
  const blocks = mergedBlocks(existing.blocks, arriving);
  const streaming = streamingAfter(existing.streaming, arriving);
  const stopsThinking = arriving.some(
    (block) => block.kind === 'thinking' || block.kind === 'redactedThinking',
  );

  const completed: StreamMessage = {
    ...existing,
    ...(stopsThinking ? thoughtUntil(existing, at) : {}),
    role,
    blocks,
    streaming,
    isComplete: streaming === null,
    text: textOf(blocks, streaming),
  };

  return withMessage(state, completed);
};

function applyToolStarted(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
): Conversation {
  const toolUseId = readText(payload, 'toolUseId');
  const toolName = readText(payload, 'toolName');

  if (toolUseId === null || toolName === null) {
    return state;
  }

  const title = readText(payload, 'title')?.trim() ?? '';
  const started: ToolExecution = {
    toolUseId,
    toolName,
    ...(title === '' ? {} : { title }),
    input: isRecord(payload['input']) ? payload['input'] : {},
    status: 'running',
    elapsed: null,
    summary: null,
    parentToolUseId: parentOf(payload),
    taskId: null,
  };

  return {
    ...state,
    tools: [...state.tools.filter((tool) => tool.toolUseId !== toolUseId), started],
    timeline: appended(state.timeline, { kind: 'tool', id: toolUseId }),
  };
}

/** A `tool.progress`: how long it has been running, which replaces what was said before. */
function progressOf(payload: Readonly<Record<string, unknown>>): ToolChange {
  return (tool) => {
    const chunk = readText(payload, 'chunk');
    return chunk === null ? null : { ...tool, elapsed: chunk };
  };
}

/** A `tool.completed`: how the tool ended, when it is an outcome the contract carries. */
function outcomeOf(payload: Readonly<Record<string, unknown>>): ToolChange {
  return (tool) => {
    const status = readText(payload, 'status');
    const question = readToolQuestion(payload['question']);

    return status === null || !TOOL_OUTCOMES.has(status)
      ? null
      : {
          ...tool,
          status: status as ToolStatus,
          summary: readText(payload, 'summary'),
          taskId: readText(payload, 'taskId'),
          ...(question === null ? {} : { question }),
        };
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

/** A count of tokens the SDK may or may not have sent: zero when it did not. */
function count(usage: Readonly<Record<string, unknown>>, field: string): number {
  const value = usage[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** The tokens of a turn, or `null` for a turn that ended with none — interrupted, say (S-98). */
function usageOf(payload: Readonly<Record<string, unknown>>): TurnUsage | null {
  const usage = payload['usage'];

  if (!isRecord(usage) || Object.keys(usage).length === 0) {
    return null;
  }

  return {
    input: count(usage, 'input_tokens'),
    output: count(usage, 'output_tokens'),
    cacheRead: count(usage, 'cache_read_input_tokens'),
    cacheWrite: count(usage, 'cache_creation_input_tokens'),
  };
}

/**
 * The end of a turn: what it cost, how long it took, the tokens — kept **once per turn**, so the
 * cost of the session never counts a turn the replay delivered twice (S-99).
 */
function applyTurn(state: Conversation, payload: Readonly<Record<string, unknown>>): Conversation {
  const turnId = readText(payload, 'turnId');
  const costUsd = readText(payload, 'costUsd');
  const durationMs = payload['durationMs'];

  if (turnId === null || costUsd === null || typeof durationMs !== 'number') {
    return state;
  }

  const turn: TurnSummary = { turnId, costUsd, durationMs, usage: usageOf(payload) };

  return {
    ...state,
    lastTurn: turn,
    turns: [...state.turns.filter((each) => each.turnId !== turnId), turn],
    timeline: appended(state.timeline, { kind: 'turn', id: turnId }),
  };
}

/** The point where the conversation was compacted — marked, so the turns before read as summarised. */
function applyCompacted(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
  frame: Envelope,
): Conversation {
  const preTokens = payload['preTokens'];

  return {
    ...state,
    timeline: appended(state.timeline, {
      kind: 'compacted',
      id: frame.seq === undefined ? frame.id : String(frame.seq),
      trigger: readText(payload, 'trigger') ?? 'auto',
      preTokens: typeof preTokens === 'number' ? preTokens : null,
    }),
  };
}

/**
 * Where the files of the session were put back — a line of the conversation, in the order it
 * happened, with how many went back, stayed and failed (plan 09, B-28). What each file did is the
 * undo dialog's, which reads the same event.
 */
function applyRewound(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
  frame: Envelope,
): Conversation {
  return readText(payload, 'promptId') === null
    ? state
    : {
        ...state,
        timeline: appended(state.timeline, {
          kind: 'rewound',
          id: frame.seq === undefined ? frame.id : String(frame.seq),
          restored: countOf(payload['reverted']),
          kept: countOf(payload['preserved']),
          failed: countOf(payload['failed']),
        }),
      };
}

/** How many files a list of the event names — none, when it is not a list. */
function countOf(files: unknown): number {
  return Array.isArray(files) ? files.filter(isRecord).length : 0;
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
    turnSince: null,
    ending: { reason: reason as SessionCloseReason, at },
  };
}

/**
 * What the session has cost since it opened, in US dollars, as text — the sum of every turn it saw
 * end, each once (S-99). A string, like the contract's: money through a float rounds where nobody
 * looks, so the sum is made in millionths, the precision the backend sends.
 */
export function sessionCostOf(turns: readonly TurnSummary[]): string {
  const millionths = turns.reduce((sum, turn) => {
    const value = Number(turn.costUsd);
    return Number.isFinite(value) ? sum + Math.round(value * 1_000_000) : sum;
  }, 0);

  return (millionths / 1_000_000).toFixed(6);
}

/**
 * The events the conversation is made of, by type.
 *
 * A `Map` and not an object literal: a frame whose type happens to be `constructor` or `toString`
 * must find nothing here, not something from `Object.prototype`. At the end of the module, because
 * some readers are constants, which exist only once their line has run.
 */
const EVENT_READERS: ReadonlyMap<string, EventReader> = new Map<string, EventReader>([
  // The session is open and nothing is running in it. The backend derives the same thing from
  // the same event; a client that waited for a `session.statusChanged` to learn it would show
  // "starting" until the first fragment of the first answer arrived.
  ['session.started', (state) => ({ ...state, status: 'idle' })],
  ['session.statusChanged', applyStatus],
  ['message.delta', aboutMessage(applyDelta)],
  ['message.completed', aboutMessage(applyCompleted)],
  ['tool.started', applyToolStarted],
  ['tool.progress', (state, payload) => changeTool(state, payload, progressOf(payload))],
  ['tool.completed', (state, payload) => changeTool(state, payload, outcomeOf(payload))],
  ['turn.completed', applyTurn],
  ['session.compacted', applyCompacted],
  ['session.rewound', applyRewound],
  ['session.closed', (state, payload, frame) => applyClosed(state, payload, frame.ts)],
]);
