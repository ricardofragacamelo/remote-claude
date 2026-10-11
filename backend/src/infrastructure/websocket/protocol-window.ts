import { PROTOCOL_VERSION } from '@remote-claude/contracts';
import type { Envelope } from '@remote-claude/contracts';

import { previousPermissionTitle, previousToolFields } from '@shared/protocol/previous-tool-fields';

/**
 * The window of deprecation of the previous protocol (plan 28, D-08): the server speaks the current
 * version and the one before it, and answers each connection in the version that connection speaks.
 * The app published on a store does not update on its own, and a client in each version may watch
 * the same session (S-37).
 *
 * The core emits the current shape only; what the previous one called differently is translated
 * here, at the edge, frame by frame, both ways. The window closes in F7 (B-47), and this file goes
 * with it.
 */
export const PREVIOUS_PROTOCOL_VERSION = PROTOCOL_VERSION - 1;

/**
 * The engine every conversation of the previous protocol belongs to: it knew one engine and named its
 * conversations by their id alone. Gone with the window (B-47).
 */
const PREVIOUS_ENGINE = 'claude';

type Payload = Readonly<Record<string, unknown>>;

/** A `ConversationRef` of the current protocol, or `undefined`. */
function refOf(value: unknown): { engine: string; id: string } | undefined {
  const ref = value as { engine?: unknown; id?: unknown } | undefined;
  return typeof ref?.engine === 'string' && typeof ref.id === 'string'
    ? { engine: ref.engine, id: ref.id }
    : undefined;
}

/** [payload] without [keys]. */
function without(payload: Payload, keys: readonly string[]): Payload {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !keys.includes(key)));
}

/** `{ engine, id }` as the previous protocol said it: the id alone. */
function idOf(value: unknown): string | undefined {
  return refOf(value)?.id;
}

/**
 * The conversation of `session.started` and `session.attached`, as the previous protocol carried it:
 * `claudeSessionId` and a `resumedFrom` of the id alone, without the engine and its capabilities.
 */
function previousSessionConversation(payload: Payload): Payload {
  const id = idOf(payload['conversation']);
  const from = idOf(payload['resumedFrom']);
  return {
    ...without(payload, ['conversation', 'resumedFrom', 'engine', 'capabilities']),
    ...(id === undefined ? {} : { claudeSessionId: id }),
    ...(from === undefined ? {} : { resumedFrom: from }),
  };
}

/** The conversation of a `transcript.*` frame, as the previous protocol named it. */
function previousFollowedConversation(payload: Payload): Payload {
  const id = idOf(payload['conversation']);
  const rest = without(payload, ['conversation']);
  return id === undefined ? rest : { ...rest, conversationId: id };
}

/** The canonical fields of a tool call (plan 28, B-15), which the previous protocol did not have. */
const CANONICAL_TOOL_FIELDS = ['kind', 'label', 'subject', 'changes', 'origin', 'rawInput'];

/**
 * A `tool.started` as the previous protocol carried it: by the engine's name and the raw input, and
 * without the `interaction` it never had (plan 28, B-21).
 */
function previousToolStarted(payload: Payload): Payload {
  return {
    ...without(payload, [...CANONICAL_TOOL_FIELDS, 'interaction']),
    ...previousToolFields(payload),
  };
}

/**
 * A `permission.requested` as the previous protocol carried it, its title keyed by the name — with the
 * question it knew, and without a plan, which it told by the tool's name (plan 28, B-20).
 */
function previousPermissionRequested(payload: Payload): Payload {
  const interaction = payload['interaction'] as { kind?: unknown } | undefined;
  return {
    ...previousToolStarted(payload),
    title: previousPermissionTitle(payload),
    ...(interaction?.kind === 'question' ? { interaction } : {}),
  };
}

/**
 * A `transcript.appended` as the previous protocol carried it: the conversation by its id, and each
 * event of the history as the socket would have carried it.
 */
function previousAppended(payload: Payload): Payload {
  const events = payload['events'];
  return {
    ...previousFollowedConversation(payload),
    ...(Array.isArray(events) ? { events: events.map(previousHistoryEvent) } : {}),
  };
}

/** One `{ type, payload }` of the history, as the previous protocol carried it. */
function previousHistoryEvent(event: unknown): unknown {
  const { type, payload } = (event ?? {}) as { type?: unknown; payload?: unknown };
  const shape = typeof type === 'string' ? TO_PREVIOUS[type] : undefined;
  return shape === undefined || typeof payload !== 'object' || payload === null
    ? event
    : { type, payload: shape(payload as Payload) };
}

/**
 * A `workspace.filesChanged` as the previous protocol carried it: a write of the agent was named after
 * the one engine it knew, with no `engine` beside it (plan 28, B-25).
 */
function previousFilesChanged(payload: Payload): Payload {
  const changes = payload['changes'];
  return Array.isArray(changes)
    ? {
        ...payload,
        changes: changes.map((change: Payload) => {
          const rest = without(change, ['engine']);
          return change['origin'] === 'agent' ? { ...rest, origin: PREVIOUS_ENGINE } : rest;
        }),
      }
    : payload;
}

/** The canonical modes as the previous protocol named them (plan 28, B-26). */
const PREVIOUS_MODES: Readonly<Record<string, string>> = { ask: 'default', readOnly: 'plan' };

/** The modes of the previous protocol as the canonical ones; `bypassPermissions` stays, and is refused. */
const CURRENT_MODES: Readonly<Record<string, string>> = { default: 'ask', plan: 'readOnly' };

/** [payload] with its [field] renamed by [names], when it names one of them. */
function renamed(
  payload: Payload,
  field: string,
  names: Readonly<Record<string, string>>,
): Payload {
  const value = payload[field];
  // Own keys only: a value named `constructor` would otherwise be renamed to the prototype's.
  return typeof value === 'string' && Object.hasOwn(names, value)
    ? { ...payload, [field]: names[value] }
    : payload;
}

/** A frame that opens or attaches to a session, as the previous protocol carried it. */
function previousSession(payload: Payload): Payload {
  return renamed(previousSessionConversation(payload), 'permissionMode', PREVIOUS_MODES);
}

/** The usage of the previous protocol: the Anthropic names (plan 28, B-29). */
const PREVIOUS_USAGE: Readonly<Record<string, string>> = {
  inputTokens: 'input_tokens',
  outputTokens: 'output_tokens',
  cacheReadTokens: 'cache_read_input_tokens',
  cacheWriteTokens: 'cache_creation_input_tokens',
};

/** A `turn.completed` as the previous protocol carried it: its usage in the Anthropic names. */
function previousTurnCompleted(payload: Payload): Payload {
  const usage = (payload['usage'] ?? {}) as Payload;
  return {
    ...payload,
    usage: Object.fromEntries(
      Object.entries(usage)
        .filter(([name]) => PREVIOUS_USAGE[name] !== undefined)
        .map(([name, value]) => [PREVIOUS_USAGE[name], value]),
    ),
  };
}

/** The block kinds of the previous protocol: the Anthropic names (plan 28, B-30). */
const PREVIOUS_BLOCKS: Readonly<Record<string, string>> = {
  redactedThinking: 'redacted_thinking',
  toolUse: 'tool_use',
  toolResult: 'tool_result',
};

/** A `message.completed` as the previous protocol carried it: its blocks in the Anthropic names. */
function previousMessageCompleted(payload: Payload): Payload {
  const content = payload['content'];
  return Array.isArray(content)
    ? {
        ...payload,
        content: content.map((block: Payload) => renamed(block, 'type', PREVIOUS_BLOCKS)),
      }
    : payload;
}

/** A `permission.resolved` as the previous protocol carried it: it had no read-only refusal to name. */
function previousPermissionResolved(payload: Payload): Payload {
  return payload['via'] === 'readOnly' ? without(payload, ['via']) : payload;
}

/** What a frame of the current protocol becomes for a connection of the previous one, by type. */
const TO_PREVIOUS: Readonly<Record<string, (payload: Payload) => Payload>> = {
  'session.started': previousSession,
  'session.attached': previousSession,
  'transcript.following': previousFollowedConversation,
  'transcript.appended': previousAppended,
  'transcript.reset': previousFollowedConversation,
  'tool.started': previousToolStarted,
  'permission.requested': previousPermissionRequested,
  'workspace.filesChanged': previousFilesChanged,
  'turn.completed': previousTurnCompleted,
  'message.completed': previousMessageCompleted,
  'permission.resolved': previousPermissionResolved,
};

/** What a command of the previous protocol says in the current one, by type. */
const FROM_PREVIOUS: Readonly<Record<string, (payload: Payload) => Payload>> = {
  'session.start': (payload) => {
    const { resumeSessionId, ...rest } = renamed(payload, 'permissionMode', CURRENT_MODES);
    return typeof resumeSessionId === 'string'
      ? { ...rest, resumeFrom: { engine: PREVIOUS_ENGINE, id: resumeSessionId } }
      : rest;
  },
  'session.setPermissionMode': (payload) => renamed(payload, 'mode', CURRENT_MODES),
  'transcript.follow': (payload) => {
    const { conversationId, ...rest } = payload;
    return typeof conversationId === 'string'
      ? { ...rest, conversation: { engine: PREVIOUS_ENGINE, id: conversationId } }
      : rest;
  },
};

/** [frame], as a connection speaking [version] reads it. */
export function toConnection(frame: Envelope, version: number): Envelope {
  if (version === PROTOCOL_VERSION) {
    return frame;
  }
  const shape = TO_PREVIOUS[frame.type];
  const payload = frame.payload as Payload | undefined;
  return {
    ...frame,
    v: version,
    ...(shape === undefined || payload === undefined ? {} : { payload: shape(payload) }),
  };
}

/** [frame], as the core reads it, whichever version its connection speaks. */
export function fromConnection(frame: Envelope): Envelope {
  if (frame.v === PROTOCOL_VERSION) {
    return frame;
  }
  const shape = FROM_PREVIOUS[frame.type];
  const payload = frame.payload as Payload | undefined;
  return shape === undefined || payload === undefined
    ? frame
    : { ...frame, payload: shape(payload) };
}
