import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import type { SessionEvent } from '@application/session';
import { isPlainObject } from '@shared/utils/plain-object';

/** What a mapping produced: the events, and whatever the caller should log a warning about. */
export interface MappedMessage {
  readonly events: readonly SessionEvent[];

  /** Set when the variant is one this build does not know. The session carries on regardless. */
  readonly unknown: string | null;
}

/** Nothing to emit, and nothing to warn about. Most of the stream is this. */
const NOTHING: MappedMessage = { events: [], unknown: null };

/**
 * `SDKMessage` → events of our contract, for one session's stream.
 *
 * This class is the reason `SDKMessage` never leaves this folder. The union has around 38
 * variants and the package is on `0.3.x`: emitting it raw would publish somebody else's
 * pre-1.0 type as our protocol, and every client would have to change with it
 * ([ADR-006](../../../../../docs/architecture/shared/00-decisions.md)).
 *
 * **It is stateful, and for exactly one reason.** A `content_block_delta` does not say which
 * message it belongs to; only the `message_start` before it does. A mapper without memory would
 * have to invent an id per fragment, and then the client rule that accumulates by `messageId` —
 * the one that stops two answers in flight from becoming one paragraph of nonsense — would have
 * nothing to accumulate. One mapper per session, and the id is remembered between fragments.
 *
 * **The survival rule is the last branch.** A variant this build has never seen is dropped and
 * reported as `unknown`; it never throws, and it never ends the session. An SDK release that adds
 * a message kind should cost a log line and a follow-up, not an outage on somebody's machine —
 * and `pnpm test:e2e:live` is what tells us a new one appeared.
 */
export class SdkMessageMapper {
  /** The message the fragments now arriving belong to, as `message_start` announced it. */
  private streaming: string | null = null;

  read(message: SDKMessage): MappedMessage {
    return toEvents(message, this);
  }

  /** Remembers, or forgets, which message the next fragments belong to. */
  setStreaming(messageId: string | null): void {
    this.streaming = messageId;
  }

  /** The message the next fragment belongs to, or `null` when the stream was joined mid-message. */
  get streamingMessageId(): string | null {
    return this.streaming;
  }
}

function toEvents(message: SDKMessage, mapper: SdkMessageMapper): MappedMessage {
  switch (message.type) {
    case 'system':
      return fromSystem(message);

    case 'stream_event':
      return fromStreamEvent(message, mapper);

    case 'assistant':
      return fromAssistant(message);

    case 'user':
      return fromUser(message);

    case 'tool_progress':
      return events({
        type: 'tool.progress',
        payload: {
          toolUseId: message.tool_use_id,
          // The SDK reports elapsed time, not output. Sending the client an empty chunk would be
          // a lie about there being new content; the elapsed reading is what it actually has.
          chunk: `${message.tool_name} · ${String(message.elapsed_time_seconds)}s`,
        },
      });

    case 'result':
      return fromResult(message);

    case 'rate_limit_event':
      // Deliberately nothing on the wire. It is a notice, not a transition: the session is alive
      // and whatever it was doing it is still doing. Publishing it as `idle` — which this used to
      // do — told a client the session had stopped while the model was mid-answer, which is the
      // one thing a status is for and the one way it can lie.
      //
      // The contract carries no event for a rate limit, and inventing one here would be inventing
      // protocol; the runner logs every message it receives, so it is not invisible. Surfacing it
      // properly belongs to the hardening plan.
      return NOTHING;

    default:
      return { events: [], unknown: describe(message) };
  }
}

/** The `system` family, which is several unrelated things under one `type`. */
function fromSystem(message: Extract<SDKMessage, { type: 'system' }>): MappedMessage {
  switch (message.subtype) {
    case 'init':
      // Deliberately nothing. Our `session.started` is published when the session is opened, with
      // **our** id, our workspace and the mode we asked for; this message says the same things in
      // the SDK's own vocabulary, with the SDK's own session id. Emitting it would put a second
      // `session.started` on the stream carrying an id no client of ours can do anything with.
      //
      // The SDK's id is what a `resume` will need, and that is the transcript plan's to collect —
      // from `SDKSessionInfo`, not from a contract event that lies about which session it is.
      return NOTHING;

    case 'compact_boundary':
      // The conversation was compacted. Nothing was lost for the user, but the session paused to
      // do it, so it is reported as a status rather than swallowed.
      return events({ type: 'session.statusChanged', payload: { status: 'thinking' } });

    case 'api_retry':
      return events({ type: 'session.statusChanged', payload: { status: 'thinking' } });

    case 'status':
      return NOTHING;

    default:
      return { events: [], unknown: describe(message) };
  }
}

/**
 * A streaming fragment of the assistant's answer.
 *
 * `message_start` is what names the message the fragments belong to, and it is the only message
 * that does — so it is remembered here and `message_stop` forgets it. The envelope's own `uuid`
 * is **not** that id: it is unique per fragment, and keying the deltas on it would make every
 * fragment a message of its own.
 *
 * A fragment with no message known — the stream was joined mid-message — is dropped rather than
 * given an invented key. Nothing is lost by it: `message.completed` carries the whole message and
 * supersedes whatever the deltas built, which is exactly what the contract says it is for.
 */
function fromStreamEvent(
  message: Extract<SDKMessage, { type: 'stream_event' }>,
  mapper: SdkMessageMapper,
): MappedMessage {
  const event = message.event;

  if (event.type === 'message_start') {
    mapper.setStreaming(String(event.message.id));
    return NOTHING;
  }

  if (event.type === 'message_stop') {
    mapper.setStreaming(null);
    return NOTHING;
  }

  if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') {
    // Thinking deltas, block starts and stops: real events of the SDK that carry no text for the
    // timeline. Dropping them is a decision, not a gap.
    return NOTHING;
  }

  const messageId = mapper.streamingMessageId;

  return messageId === null
    ? NOTHING
    : events({ type: 'message.delta', payload: { messageId, delta: event.delta.text } });
}

/**
 * A completed assistant message.
 *
 * One message can be both an answer and the start of a tool call, so this is the one branch that
 * emits more than one event: the blocks are published as a completed message, and every `tool_use`
 * block among them also opens a tool.
 */
function fromAssistant(message: Extract<SDKMessage, { type: 'assistant' }>): MappedMessage {
  return assistantEvents(message.message.id, message.message.content);
}

/** The events of an assistant message, from its id and its content — live or read back. */
function assistantEvents(messageId: string, content: unknown): MappedMessage {
  const blocks = asArray(content);

  const started = blocks
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      type: 'tool.started',
      payload: {
        toolUseId: String(block.id ?? ''),
        toolName: String(block.name ?? ''),
        input: isPlainObject(block.input) ? block.input : {},
      },
    }));

  return events(
    {
      type: 'message.completed',
      payload: {
        messageId,
        role: 'assistant',
        content: blocks.map(toContentBlock),
      },
    },
    ...started,
  );
}

/**
 * A user message — which, in this stream, is usually the SDK reporting a tool result.
 *
 * A real prompt echoed back carries no `tool_result` block and produces a completed message, so
 * the client can show what was sent from the other device.
 */
function fromUser(message: Extract<SDKMessage, { type: 'user' }>): MappedMessage {
  return userEvents(message.uuid ?? '', message.message.content);
}

/** The events of a user message, from its id and its content — live or read back. */
function userEvents(messageId: string, content: unknown): MappedMessage {
  const blocks = asArray(content);
  const results = blocks.filter((block) => block.type === 'tool_result');

  if (results.length === 0) {
    return events({
      type: 'message.completed',
      payload: {
        messageId,
        role: 'user',
        content: blocks.map(toContentBlock),
      },
    });
  }

  return events(
    ...results.map((block) => ({
      type: 'tool.completed',
      payload: {
        toolUseId: String(block.tool_use_id ?? ''),
        status: block.is_error === true ? 'failed' : 'succeeded',
        summary: summarise(block.content),
      },
    })),
  );
}

/** The end of a turn, with what it cost. */
function fromResult(message: Extract<SDKMessage, { type: 'result' }>): MappedMessage {
  return events({
    type: 'turn.completed',
    payload: {
      turnId: message.uuid,
      usage: isPlainObject(message.usage) ? message.usage : {},
      // A string and not a number: money through a float is money that rounds where nobody looks.
      costUsd: message.total_cost_usd.toFixed(6),
      durationMs: message.duration_ms,
    },
  });
}

/**
 * A message read back from a transcript, as the events the live stream produced for it.
 *
 * It goes through **the same two functions** the live stream does, and that is the whole of B-03:
 * a message from history reaches the client as the `message.completed`, `tool.started` and
 * `tool.completed` it was when it happened, with the same ids — so the client that reloads after a
 * `gap` recognises what it already has instead of showing it twice. Two mappings would drift, and
 * the one that drifts is the one nobody watches.
 *
 * A `system` entry is never asked for, and would produce nothing if it were: none of it is a
 * message of the timeline.
 */
export function historicalEvents(message: SessionMessage): readonly SessionEvent[] {
  const body = isPlainObject(message.message) ? message.message : {};

  switch (message.type) {
    case 'assistant':
      // The API's message id, exactly as the live `assistant` message carries it — that is the
      // key the client already accumulated deltas under.
      return assistantEvents(
        typeof body['id'] === 'string' ? body['id'] : message.uuid,
        body['content'],
      ).events;

    case 'user':
      return userEvents(message.uuid, body['content']).events;

    default:
      return [];
  }
}

/** One or more events, in the order they should reach the client. */
function events(...list: readonly SessionEvent[]): MappedMessage {
  return { events: list, unknown: null };
}

/** How an unmapped variant is named in the log. Never the payload — it may carry file content. */
function describe(message: unknown): string {
  if (!isPlainObject(message)) {
    return 'not an object';
  }

  const type = String(message['type'] ?? 'absent');
  const subtype = message['subtype'];

  return subtype === undefined ? type : `${type}:${String(subtype)}`;
}

/** A content block of our contract: the kind, plus the two fields the contract names. */
function toContentBlock(block: Record<string, unknown>): Record<string, unknown> {
  const type = String(block['type'] ?? 'unknown');
  const text = block['text'];
  const toolUseId = block['id'] ?? block['tool_use_id'];

  return {
    type,
    ...(typeof text === 'string' ? { text } : {}),
    ...(typeof toolUseId === 'string' ? { toolUseId } : {}),
  };
}

/**
 * A short result for the timeline.
 *
 * Truncated on purpose, and never the whole thing: a `Read` of a large file would otherwise put
 * the file into the event stream, into the replay buffer and into everybody's browser.
 */
function summarise(content: unknown): string {
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');

  return text.length <= 200 ? text : `${text.slice(0, 200)}…`;
}

/** Message content, which the SDK gives as a string or as blocks, always as blocks. */
function asArray(content: unknown): Record<string, unknown>[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  return Array.isArray(content) ? content.filter(isPlainObject) : [];
}
