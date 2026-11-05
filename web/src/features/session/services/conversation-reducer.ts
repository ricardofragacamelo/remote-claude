import { SILENT_EVENT_TYPES } from '@remote-claude/contracts';
import type { Envelope } from '@remote-claude/contracts';

import { isRecord, readText } from '@/shared/lib/json';
import { logger } from '@/shared/logging/logger';
import { readToolCall } from '@/shared/lib/tool-call';
import { isTurnRunning } from '../lib/turn';
import type { HistoryEvent } from '../types/history';
import { applyTasksChanged } from './tasks-changed';
import { readToolQuestion } from './tool-question';
import type {
  BlockKind,
  Conversation,
  MessageBlock,
  NoticeLevel,
  SessionCloseReason,
  SessionStatus,
  StreamMessage,
  TimelineEntry,
  ToolAttachment,
  ToolExecution,
  ToolStatus,
  TurnOutcome,
  TurnSummary,
  TurnUsage,
  UnknownReason,
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
  taskList: null,
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

/**
 * The reader of an event about one message: a payload that names no message is malformed (U-09),
 * never silently dropped.
 */
function aboutMessage(read: MessageReader): EventReader {
  return (state, payload, frame) => {
    const messageId = readText(payload, 'messageId');
    return messageId === null
      ? appendGenericOnce(state, `malformed:${frame.type}`, 'malformed')
      : read(state, messageId, payload, frame.ts);
  };
}

/** The silent event types, as a plain lookup — the tuple `includes` only widens to its own members. */
const SILENT_TYPES: ReadonlySet<string> = new Set(SILENT_EVENT_TYPES);

/**
 * The generic line this build draws in place of something it does not understand (plan 27, F6 ·
 * B-20): a WS event with no reader, a known event with an enum value or a required field this build
 * does not recognise, or a `session.notice` of a `kind` it has no line for. The same row the backend's
 * own `kind: 'unknown'` notice draws (B-19) — a line genuinely unknown to a published client is not a
 * different kind of thing from one the backend itself could not place.
 *
 * One line **per type, ever**, for an unknown event (U-06) and for a malformed one (U-09): a build
 * that never learns this type does not need to say so again every time it arrives. An unknown enum
 * value gets one line per (type, field): two different bad values of the same field are both worth
 * knowing about.
 */
function appendGenericOnce(
  state: Conversation,
  id: string,
  reason: UnknownReason,
  detail?: string,
): Conversation {
  if (state.timeline.some((entry) => entry.kind === 'notice' && entry.id === id)) {
    return state;
  }

  // A malformed event is a contract violated, never forward-compatibility: it is worth a `warn`,
  // not just the `debug` an unknown-but-well-formed event gets (U-09).
  if (reason === 'malformed') {
    logger.warn({ op: 'conversation.readEvent', id }, 'malformed event, required field missing');
  }

  return {
    ...state,
    timeline: [
      ...state.timeline,
      {
        kind: 'notice',
        id,
        reason,
        level: 'notice',
        text: null,
        truncated: false,
        parentToolUseId: null,
        ...(detail === undefined ? {} : { detail }),
      },
    ],
  };
}

/**
 * One frame, applied to the conversation.
 *
 * This is where the shape of the backend stops existing: everything above works with `Conversation`
 * and never with an `Envelope`. It is a pure function of (state, frame), which is what lets every
 * ordering rule be tested without a socket, a store or a component.
 *
 * Three cases, checked in order (plan 27, F1 · B-04): a type with its own reader is applied, as
 * always; a type the contract classifies `silent` ([05-websocket-protocol](../../../../../docs/architecture/shared/05-websocket-protocol.md#eventos-servidor--cliente))
 * changes nothing, on purpose; and the rest — truly unknown to this build — also changes nothing
 * **for now**, the same survival rule the backend applies to an unknown message of the engine: a
 * published client has to keep working when the contract gains an event it has never heard of. The
 * third case is what the F6 redraws into a line.
 */
export function readEvent(state: Conversation, frame: Envelope): Conversation {
  const read = EVENT_READERS.get(frame.type);

  if (read !== undefined) {
    logger.debug({ op: 'conversation.readEvent', type: frame.type }, 'event read');

    const payload = frame.payload ?? {};
    const next = read(state, payload, frame);
    const at = readText(payload, 'at');

    // An event of the history says when its entry was written: the next thinking is measured from it.
    return at === null ? next : { ...next, writtenAt: at };
  }

  if (SILENT_TYPES.has(frame.type)) {
    logger.debug({ op: 'conversation.readEvent', type: frame.type }, 'silent event, no reader');
    return state;
  }

  logger.debug({ op: 'conversation.readEvent', type: frame.type }, 'unknown event, no reader');
  return appendGenericOnce(state, `unknown-event:${frame.type}`, 'unknownEvent', frame.type);
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
    // The list is whole in every event: the stream's, once it said one, is the newer.
    taskList: live.taskList ?? past.taskList,
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
 *
 * A `status` this build does not recognise leaves the session where it was (U-07) — a card in its
 * last known state is still true; a guess at a new one might not be — and the generic line says
 * which value it was.
 */
function applyStatus(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
  frame: Envelope,
): Conversation {
  const raw = payload['status'];

  if (typeof raw !== 'string') {
    return appendGenericOnce(state, `malformed:${frame.type}`, 'malformed');
  }

  const status = statusOf(payload) ?? state.status;
  const since = state.turnSince ?? (frame.ts === '' ? null : frame.ts);
  const next = { ...state, status, turnSince: isTurnRunning(status) ? since : null };

  return STATUSES.has(raw)
    ? next
    : appendGenericOnce(next, `unknown-value:${frame.type}:status`, 'unknownValue', raw);
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
 * nothing has announced yet starts one, because the engine streams before it completes anything. A
 * fragment of thinking goes to a thinking block, never into the answer (plan 08, D-17).
 */
const applyDelta: MessageReader = (state, messageId, payload, at) => {
  const delta = readText(payload, 'delta');

  if (delta === null) {
    return state;
  }

  const blockType = readText(payload, 'blockType');

  // A block type this build does not know (U-08): never summed into the answer. The block itself
  // still arrives whole in the `message.completed` that finishes it, drawn generically (U-05) —
  // this just refuses to let its fragments pass as the model's own words in the meantime.
  if (blockType !== null && blockType !== 'text' && blockType !== 'thinking') {
    return state;
  }

  const kind = blockType === 'thinking' ? 'thinking' : 'text';
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

/**
 * The kinds of block a message is drawn with, by the `type` the contract carries — our names (plan
 * 28, B-30). A `toolUse` and a `toolResult` are drawn as their tool, never as a block of the message.
 */
const BLOCK_KINDS: ReadonlyMap<string, BlockKind> = new Map<string, BlockKind>([
  ['text', 'text'],
  ['thinking', 'thinking'],
  ['redactedThinking', 'redactedThinking'],
  ['image', 'image'],
]);

/**
 * Block types never drawn as part of the message: `toolUse` and `toolResult` are drawn whole as
 * their own tool, elsewhere in the timeline, never as a block of the message that calls one (plan
 * 28, S-88). The adapter's own canonicalisation of the engine's own block kinds (plan 28, B-30)
 * happens before anything reaches the wire, live or from the history — this build never has to
 * recognise the engine's own spelling of a kind it already knows under its canonical name, and must
 * not (neutral core): a client that somehow received the engine's own spelling anyway reads it as
 * any other block it does not know (U-05), never silently, which is the generic line's whole point.
 */
const SILENT_BLOCK_TYPES = new Set<string>(['toolUse', 'toolResult']);

/** What an image block says of itself: its type and its size — the bytes never travel (D-09). */
function imageOf(block: Readonly<Record<string, unknown>>): Partial<MessageBlock> {
  const mediaType = readText(block, 'mediaType');
  const size = block['size'];

  return {
    ...(mediaType === null ? {} : { mediaType }),
    ...(typeof size === 'number' && Number.isFinite(size) && size >= 0 ? { size } : {}),
  };
}

/** An unrecognised block (U-05): drawn generically, with its text when it has one. */
function unknownBlockOf(block: Readonly<Record<string, unknown>>, blockType: string): MessageBlock {
  const blockId = readText(block, 'blockId');

  return {
    kind: 'unknown',
    text: readText(block, 'text') ?? '',
    blockType,
    ...(blockId === null ? {} : { blockId }),
  };
}

/** One block of a message's content, by its own `type` — `null` for one this message never draws. */
function blockOf(block: unknown, atMostMs: number | null): MessageBlock | null {
  if (!isRecord(block)) {
    return null;
  }

  const blockType = String(block['type']);

  if (SILENT_BLOCK_TYPES.has(blockType)) {
    return null;
  }

  const kind = BLOCK_KINDS.get(blockType);

  if (kind === undefined) {
    return unknownBlockOf(block, blockType);
  }

  const blockId = readText(block, 'blockId');
  const text = kind === 'thinking' ? readText(block, 'thinking') : readText(block, 'text');

  return {
    kind,
    text: text ?? '',
    ...(blockId === null ? {} : { blockId }),
    ...(kind === 'thinking' && atMostMs !== null ? { atMostMs } : {}),
    ...(kind === 'image' ? imageOf(block) : {}),
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

  return content.flatMap((block) => {
    const read = blockOf(block, atMostMs);
    return read === null ? [] : [read];
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
/**
 * What `injected.kind` draws instead of a message bubble (plan 27, F6 · B-21): `contextSummary`
 * folds into the `compacted` entry it belongs to; `instructions` and `other` get their own line,
 * nested under whichever subagent put them there. `commandExpansion` is deliberately absent — it is
 * meant to read exactly like the prompt it expands to, and falls through to the ordinary message
 * path below, same as no `injected` at all.
 */
function injectedLineKindOf(kind: string | null): 'instructions' | 'other' | null {
  return kind === 'instructions' || kind === 'other' ? kind : null;
}

/** The text of a compaction's synthetic summary message — its text blocks, joined. */
function summaryTextOf(payload: Readonly<Record<string, unknown>>): string {
  return blocksOf(payload, null)
    .filter((block) => block.kind === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * The summary of the **last** `compacted` entry of the timeline, filled in — never drawn as its own
 * message (B-21): a summary nobody wrote is not "You" saying it. Silently dropped if no compaction
 * precedes it, which a server that sends the fields in the documented order never does.
 */
function applyContextSummary(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
): Conversation {
  const text = summaryTextOf(payload);
  const at = state.timeline.findLastIndex((entry) => entry.kind === 'compacted');

  if (at === -1) {
    return state;
  }

  const timeline = [...state.timeline];
  timeline[at] = {
    ...(timeline[at] as Extract<TimelineEntry, { kind: 'compacted' }>),
    summary: text,
  };

  return { ...state, timeline };
}

/**
 * The agent's own content (a skill's body, or a kind this build has no line of its own for) as its
 * line — never a message bubble (B-21): the client picks the line by `injected.kind`, never by the
 * tool's name, and nests it under the subagent that owns it the same way a notice does.
 */
function applyInjectedLine(
  state: Conversation,
  messageId: string,
  kind: 'instructions' | 'other',
  payload: Readonly<Record<string, unknown>>,
): Conversation {
  const injected = isRecord(payload['injected']) ? payload['injected'] : {};

  return {
    ...state,
    timeline: appended(state.timeline, {
      kind: 'injected',
      id: `message:${messageId}`,
      injectedKind: kind,
      name: readText(injected, 'name'),
      parentToolUseId: parentOf(payload),
    }),
  };
}

const applyCompleted: MessageReader = (state, messageId, payload, at) => {
  const injected = isRecord(payload['injected']) ? payload['injected'] : null;
  const injectedKind = injected === null ? null : readText(injected, 'kind');

  if (injectedKind === 'contextSummary') {
    return applyContextSummary(state, payload);
  }

  const lineKind = injectedLineKindOf(injectedKind);
  if (lineKind !== null) {
    return applyInjectedLine(state, messageId, lineKind, payload);
  }

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
  const call = readToolCall(payload);

  if (toolUseId === null || call === null) {
    return appendGenericOnce(state, 'malformed:tool.started', 'malformed');
  }

  const title = readText(payload, 'title')?.trim() ?? '';
  const started: ToolExecution = {
    toolUseId,
    ...call,
    ...(title === '' ? {} : { title }),
    status: 'running',
    elapsed: null,
    summary: null,
    parentToolUseId: parentOf(payload),
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
/** One attachment of a `tool.completed`, read by its own `kind` (plan 27, F6 · B-22) — an entry with
 * no readable `kind` is dropped: B-20's generic line is for a kind this build cannot classify, not
 * for one missing its own classifier. */
function imageAttachmentOf(raw: Readonly<Record<string, unknown>>): ToolAttachment {
  const blockId = readText(raw, 'blockId');
  const mediaType = readText(raw, 'mediaType');
  const size = raw['size'];
  return {
    kind: 'image',
    ...(blockId === null ? {} : { blockId }),
    ...(mediaType === null ? {} : { mediaType }),
    ...(typeof size === 'number' ? { size } : {}),
  };
}

function linkAttachmentOf(raw: Readonly<Record<string, unknown>>): ToolAttachment {
  const uri = readText(raw, 'uri');
  const title = readText(raw, 'title');
  return { kind: 'link', ...(uri === null ? {} : { uri }), ...(title === null ? {} : { title }) };
}

function attachmentOf(raw: unknown): ToolAttachment | null {
  if (!isRecord(raw)) {
    return null;
  }

  const kind = readText(raw, 'kind');

  if (kind === 'image') {
    return imageAttachmentOf(raw);
  }
  if (kind === 'link') {
    return linkAttachmentOf(raw);
  }
  if (kind === null) {
    return null;
  }

  const type = readText(raw, 'type');
  return { kind: 'unknown', ...(type === null ? {} : { type }) };
}

function attachmentsOf(payload: Readonly<Record<string, unknown>>): readonly ToolAttachment[] {
  const raw = payload['attachments'];
  return Array.isArray(raw) ? raw.flatMap((each) => attachmentOf(each) ?? []) : [];
}

function outcomeOf(payload: Readonly<Record<string, unknown>>): ToolChange {
  return (tool) => {
    const status = readText(payload, 'status');
    const question = readToolQuestion(payload['question']);
    const attachments = attachmentsOf(payload);

    return status === null || !TOOL_OUTCOMES.has(status)
      ? null
      : {
          ...tool,
          status: status as ToolStatus,
          summary: readText(payload, 'summary'),
          ...(question === null ? {} : { question }),
          ...(attachments.length === 0 ? {} : { attachments }),
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

/** The counts of a turn the contract names (plan 28, B-29) — each read only when it came. */
const USAGE_COUNTS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'reasoningTokens',
  'webSearches',
] as const satisfies readonly (keyof TurnUsage)[];

/**
 * What a turn used — the counts the engine reported, and nothing it did not —, or `null` for a turn
 * that reported none: interrupted before the model answered (S-98), or an engine that counts nothing
 * (S-86).
 */
function usageOf(payload: Readonly<Record<string, unknown>>): TurnUsage | null {
  const usage = isRecord(payload['usage']) ? payload['usage'] : {};
  const counts = USAGE_COUNTS.flatMap((field) => {
    const value = usage[field];
    return typeof value === 'number' && Number.isFinite(value) ? [[field, value] as const] : [];
  });

  return counts.length === 0 ? null : (Object.fromEntries(counts) as TurnUsage);
}

/** The outcomes the contract names — a value this build does not recognise reads as `failed`:
 * an unlabelled failure is still the truth, where a guess at its label would not be. */
const TURN_OUTCOMES: ReadonlySet<string> = new Set<TurnOutcome>([
  'completed',
  'limitReached',
  'budgetExceeded',
  'failed',
]);

function turnOutcomeOf(payload: Readonly<Record<string, unknown>>): TurnOutcome {
  const outcome = payload['outcome'];

  // Absent entirely: a build of the backend from before this field existed, which never sent a
  // failed-looking turn.completed at all — read the same way it always was, not as a failure that
  // was never one.
  if (outcome === undefined) {
    return 'completed';
  }

  return typeof outcome === 'string' && TURN_OUTCOMES.has(outcome)
    ? (outcome as TurnOutcome)
    : 'failed';
}

/**
 * The end of a turn: how it ended, what it cost — when the engine says (S-86) —, how long it took,
 * the tokens — kept **once per turn**, so the cost of the session never counts a turn the replay
 * delivered twice (S-99).
 */
function applyTurn(state: Conversation, payload: Readonly<Record<string, unknown>>): Conversation {
  const turnId = readText(payload, 'turnId');
  const durationMs = payload['durationMs'];

  if (turnId === null || typeof durationMs !== 'number') {
    return appendGenericOnce(state, 'malformed:turn.completed', 'malformed');
  }

  const turn: TurnSummary = {
    turnId,
    outcome: turnOutcomeOf(payload),
    costUsd: readText(payload, 'costUsd'),
    durationMs,
    usage: usageOf(payload),
  };

  return {
    ...state,
    lastTurn: turn,
    turns: [...state.turns.filter((each) => each.turnId !== turnId), turn],
    timeline: appended(state.timeline, { kind: 'turn', id: turnId }),
  };
}

/** The levels a notice carries. A level this build does not recognise reads as `notice`: still shown,
 * never hidden, and never mistaken for `error`'s emphasis. */
const NOTICE_LEVELS = new Set<string>(['info', 'notice', 'warning', 'error']);

function levelOf(payload: Readonly<Record<string, unknown>>): NoticeLevel {
  const level = readText(payload, 'level');
  return level !== null && NOTICE_LEVELS.has(level) ? (level as NoticeLevel) : 'notice';
}

/**
 * The `kind`s of `session.notice` this build has a line for ([§8.2's twelve](../../../../../docs/discovery/09-perdas-do-backend-na-conversa.md#82-o-evento-de-aviso),
 * `unknown` excepted — that one already **is** the generic line). A `kind` not in this set is drawn
 * exactly like `unknown`: the client draws by `kind`, never by `origin.engine` or `origin.native`
 * (plan 28), and a kind it does not know yet is not an error, the same survival rule as an unknown
 * WS event (U-11).
 */
const KNOWN_NOTICE_KINDS = new Set<string>([
  'command.output',
  'agent.info',
  'agent.notification',
  'agent.stopping',
  'model.switched',
  'model.refused',
  'request.retrying',
  'usage.limited',
  'turn.failed',
  'compaction.failed',
  'auth.failed',
]);

/**
 * A `session.notice`, read into the timeline entry that draws it (plan 27, F6 · B-19). A notice
 * without a `noticeId` cannot be kept from duplicating on replay, so it changes nothing — the one
 * payload field this reader insists on, same as `aboutMessage` insists on `messageId`.
 */
function applyNotice(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
): Conversation {
  const noticeId = readText(payload, 'noticeId');

  if (noticeId === null) {
    return state;
  }

  const kind = readText(payload, 'kind') ?? 'unknown';
  const messageKey = readText(payload, 'messageKey');
  const known = KNOWN_NOTICE_KINDS.has(kind);
  const origin = isRecord(payload['origin']) ? payload['origin'] : {};
  const entry: TimelineEntry = {
    kind: 'notice',
    id: `notice:${noticeId}`,
    noticeKind: kind,
    level: levelOf(payload),
    text: readText(payload, 'text'),
    truncated: payload['truncated'] === true,
    parentToolUseId: parentOf(payload),
    ...(messageKey === null
      ? {}
      : { messageKey, params: isRecord(payload['params']) ? payload['params'] : {} }),
    // An unrecognised `kind` (B-13's own `unknown`, or a future one this build has no line for, U-11)
    // names what arrived by the engine's own, opaque name for it — never the JSON (D-03).
    ...(known
      ? {}
      : { reason: 'unknownNotice' as const, detail: readText(origin, 'native') ?? kind }),
  };

  return { ...state, timeline: appendNotice(state.timeline, entry) };
}

/**
 * The timeline with a notice added — once per `noticeId`, never duplicated by a replay. A `kind`
 * this build has no line for collapses with the one before it when they are the identical notice
 * repeated ("×3", D-12): ten in a row make one line, but A, B, A intercalated stay three — the
 * counter never joins what is not a run.
 */
/** Whether `last` is the identical unrecognised-kind notice `entry` repeats, immediately — the one
 * case the "×3" counter collapses (D-12): ten in a row make one line, but a gap of anything else
 * in between starts a new one (S-87). */
function repeatsUnknownNotice(
  last: TimelineEntry | undefined,
  entry: Extract<TimelineEntry, { kind: 'notice' }>,
): last is Extract<TimelineEntry, { kind: 'notice' }> {
  return (
    last?.kind === 'notice' &&
    last.reason === 'unknownNotice' &&
    entry.reason === 'unknownNotice' &&
    last.noticeKind === entry.noticeKind &&
    last.text === entry.text &&
    last.detail === entry.detail
  );
}

function appendNotice(
  timeline: readonly TimelineEntry[],
  entry: TimelineEntry,
): readonly TimelineEntry[] {
  if (timeline.some((each) => each.kind === 'notice' && each.id === entry.id)) {
    return timeline;
  }

  const last = timeline[timeline.length - 1];

  if (entry.kind === 'notice' && repeatsUnknownNotice(last, entry)) {
    return [...timeline.slice(0, -1), { ...last, count: (last.count ?? 1) + 1 }];
  }

  return [...timeline, entry];
}

/** The point where the conversation was compacted — marked, so the turns before read as summarised. */
function applyCompacted(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
  frame: Envelope,
): Conversation {
  const preTokens = payload['preTokens'];
  const compactionId = readText(payload, 'compactionId');

  return {
    ...state,
    timeline: appended(state.timeline, {
      kind: 'compacted',
      // Stable live, on replay and from the history (plan 27, F3 · B-09, F5 · B-18) — falls back to
      // the frame's own identity from a server older than the field.
      id: compactionId ?? (frame.seq === undefined ? frame.id : String(frame.seq)),
      trigger: readText(payload, 'trigger') ?? 'auto',
      preTokens: typeof preTokens === 'number' ? preTokens : null,
      summary: null,
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
    ? appendGenericOnce(state, 'malformed:session.rewound', 'malformed')
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

  if (reason === null) {
    return appendGenericOnce(state, 'malformed:session.closed', 'malformed');
  }

  if (!CLOSE_REASONS.has(reason)) {
    return appendGenericOnce(state, 'unknown-value:session.closed:reason', 'unknownValue', reason);
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
    // A turn whose engine reports no cost adds nothing — never a zero it did not say.
    const value = turn.costUsd === null ? Number.NaN : Number(turn.costUsd);
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
  [
    'tool.completed',
    (state, payload) => {
      const changed = changeTool(state, payload, outcomeOf(payload));
      const status = readText(payload, 'status');

      return status !== null && !TOOL_OUTCOMES.has(status)
        ? appendGenericOnce(changed, 'unknown-value:tool.completed:status', 'unknownValue', status)
        : changed;
    },
  ],
  ['turn.completed', applyTurn],
  ['session.compacted', applyCompacted],
  ['session.rewound', applyRewound],
  ['session.tasksChanged', applyTasksChanged],
  ['session.closed', (state, payload, frame) => applyClosed(state, payload, frame.ts)],
  ['session.notice', applyNotice],
]);
