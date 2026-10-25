import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import { canonicalToolPayload } from '@application/session';
import type { SessionEvent } from '@application/session';
import type {
  MessageCompletedPayloadContentItem,
  TurnCompletedPayload,
  TurnCompletedPayloadUsage,
} from '@remote-claude/contracts';
import type { TaskItem } from '@domain/engine';
import { TaskListTracker } from '@domain/session';
import { menuOf } from '@domain/session';
import { base64Size } from '@domain/shared';
import { CLAUDE_COMMAND_MENU } from '@domain/engines/claude';
import { isPlainObject } from '@shared/utils/plain-object';
import { classifyTool } from './tool-classifier';
import { toSlashCommand } from './slash-command-mapping';

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

  /** The agent's task list, followed call by call (plan 28, B-22). */
  readonly tasks = new TaskListTracker();

  /**
   * The cumulative spend the last `result` of this session reported — `total_cost_usd` is the
   * running total of the whole `query()`, across every turn, never one turn's own (plan 16, D-02).
   * {@link turnCostOf} is the delta from it, which is what a turn actually cost.
   */
  private lastCumulativeCostUsd = 0;

  /** @param folder the session's folder — what the paths of a tool's label are relative to */
  constructor(readonly folder: string) {}

  read(message: SDKMessage): MappedMessage {
    return toEvents(message, this);
  }

  /**
   * [total]'s own spend since the last turn of this session — never the raw cumulative figure the
   * SDK reports. A figure **lower** than what was last seen is not a negative turn: it is `/clear`
   * mid-session, or a resumed session whose transcript already paid for the total once — either
   * way, nothing of it belongs to an earlier turn of this process, so the whole of it is this one's.
   *
   * The first turn of a fresh process has nothing to subtract from, so it is charged the whole
   * figure — exactly a resumed conversation's own carried-over cost, charged again here. A full fix
   * needs a baseline kept **per conversation**, past this process's own lifetime (plan 16, D-02,
   * not done); this is the in-memory, one-process slice of it.
   */
  turnCostOf(total: number): number {
    const delta = total - this.lastCumulativeCostUsd;
    this.lastCumulativeCostUsd = total;
    return delta >= 0 ? delta : total;
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
      return fromAssistant(message, mapper);

    case 'user':
      return fromUser(message, mapper.tasks);

    case 'tool_progress':
      return events({
        type: 'tool.progress',
        payload: {
          toolUseId: message.tool_use_id,
          // The SDK reports elapsed time, not output. Sending the client an empty chunk would be
          // a lie about there being new content; the elapsed reading is what it actually has. The
          // tool's name stays out: the client has the label of its `tool.started` (plan 28, S-48).
          chunk: `${String(message.elapsed_time_seconds)}s`,
          ...parentOf(message.parent_tool_use_id),
        },
      });

    case 'result':
      return fromResult(message, mapper);

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
      return QUIET_TYPES.has(typeOf(message))
        ? NOTHING
        : { events: [], unknown: describe(message) };
  }
}

/**
 * Real messages of the CLI that the typed union of the SDK does not name, known so they cost no
 * warning: `command_lifecycle` — `queued`, `started` — is the CLI acknowledging a prompt streamed
 * with a uuid, which every prompt of ours is (plan 08, F6, recorded in `stamped-turn`). The queue of
 * prompts is the backend's own (D-14), and it already says when a prompt waits, starts or leaves.
 */
const QUIET_TYPES: ReadonlySet<string> = new Set(['command_lifecycle']);

/** The `type` of a message, whatever the message is. */
function typeOf(message: unknown): string {
  return isPlainObject(message) ? String(message['type'] ?? 'absent') : 'not an object';
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
      // The conversation was compacted: what came before is a summary now. Said on its own, so a
      // client keeping the turns on screen can mark the point (plan 08, B-02).
      return events({
        type: 'session.compacted',
        payload: {
          trigger: message.compact_metadata.trigger,
          preTokens: message.compact_metadata.pre_tokens,
        },
      });

    case 'commands_changed':
      // The menu changed mid-session — a skill discovered as the agent works in a subdirectory,
      // say. The push already carries the whole list, so the client replaces its menu with this
      // instead of asking `supportedCommands()` again (found live, plan 28, B-46).
      return events({
        type: 'session.commandsChanged',
        payload: { commands: menuOf(message.commands.map(toSlashCommand), CLAUDE_COMMAND_MENU) },
      });

    case 'api_retry':
      return events({ type: 'session.statusChanged', payload: { status: 'thinking' } });

    default:
      return QUIET_SYSTEM_SUBTYPES.has(message.subtype)
        ? NOTHING
        : { events: [], unknown: describe(message) };
  }
}

/**
 * Real messages of the SDK — the CLI's own status, a counter of thinking, the lifecycle of a
 * subagent or a background task — that carry nothing for the timeline the contract does not already
 * say: the subagent's own messages and its tool are what the client draws. Known, so they cost no
 * warning (measured in plan 08, discovery §10).
 */
const QUIET_SYSTEM_SUBTYPES: ReadonlySet<string> = new Set([
  'status',
  'thinking_tokens',
  'task_started',
  'task_progress',
  'task_updated',
  'task_notification',
  'background_tasks_changed',
]);

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

  const fragment = fragmentOf(event);
  const messageId = mapper.streamingMessageId;

  if (fragment === null || messageId === null) {
    // Block starts and stops, signatures, the input of a tool as it is typed: real events of the
    // SDK that carry nothing for the timeline. Dropping them is a decision, not a gap.
    return NOTHING;
  }

  return events({
    type: 'message.delta',
    payload: {
      messageId,
      delta: fragment.text,
      // Thinking was dropped here until plan 08 (D-17): it is shown now, folded, and so it travels
      // as a block of its own kind. Text keeps the shape it always had.
      ...(fragment.thinking ? { blockType: 'thinking' } : {}),
      ...parentOf(message.parent_tool_use_id),
    },
  });
}

/** The text a streaming event adds, and whether it is thinking — or `null` for one that adds none. */
function fragmentOf(
  event: Extract<SDKMessage, { type: 'stream_event' }>['event'],
): { readonly text: string; readonly thinking: boolean } | null {
  if (event.type !== 'content_block_delta') {
    return null;
  }

  if (event.delta.type === 'text_delta') {
    return { text: event.delta.text, thinking: false };
  }

  return event.delta.type === 'thinking_delta' && event.delta.thinking !== ''
    ? { text: event.delta.thinking, thinking: true }
    : null;
}

/**
 * The subagent an event belongs to, as the contract carries it — nothing for the main conversation.
 *
 * Absent rather than `null`: a field the contract makes optional is left out, and every event of the
 * main conversation keeps the shape it had before subagents were forwarded (plan 08, D-15).
 */
function parentOf(parent: string | null | undefined): { readonly parentToolUseId?: string } {
  return typeof parent === 'string' && parent !== '' ? { parentToolUseId: parent } : {};
}

/**
 * A completed assistant message.
 *
 * One message can be both an answer and the start of a tool call, so this is the one branch that
 * emits more than one event: the blocks are published as a completed message, and every `tool_use`
 * block among them also opens a tool.
 */
function fromAssistant(
  message: Extract<SDKMessage, { type: 'assistant' }>,
  mapper: SdkMessageMapper,
): MappedMessage {
  return assistantEvents({
    messageId: message.message.id,
    uuid: idOf(message.uuid),
    content: message.message.content,
    parent: message.parent_tool_use_id,
    folder: mapper.folder,
    tasks: mapper.tasks,
  });
}

/** A message of the conversation as both readers see it: the live stream, and the transcript. */
interface ReadMessage {
  readonly messageId: string;

  /**
   * The id of the transcript entry the message is — the same live and read back (measured, plan 22,
   * D-06) —, which the blocks are identified by. Empty when the SDK gave none: no `blockId` then.
   */
  readonly uuid: string;

  readonly content: unknown;

  /** When the entry was written — read back only; live, the frame's own instant is the clock. */
  readonly at?: string | undefined;

  /** The folder of the session, which the paths of a tool's label are relative to — `''` unknown. */
  readonly folder?: string;

  /** The task list of the conversation the message is of — none for a subagent's page. */
  readonly tasks?: TaskListTracker | undefined;

  /** The tool that opened the subagent it is of — absent on the main conversation. */
  readonly parent: string | null | undefined;

  /**
   * The structured result of the tool a `tool_result` answers — live only: the transcript the SDK
   * reads back has none (measured, plan 08, B-20).
   */
  readonly result?: unknown;
}

/** The events of an assistant message, from its id and its content — live or read back. */
function assistantEvents({
  messageId,
  uuid,
  content,
  parent,
  at,
  folder = '',
  tasks,
}: ReadMessage): MappedMessage {
  const blocks = asArray(content);
  const subagent = parentOf(parent);
  const written = atOf(at);

  const started = blocks
    .filter((block) => block.type === 'tool_use')
    .map((block) => {
      const input = isPlainObject(block.input) ? block.input : {};
      const tool = classifyTool(String(block.name ?? ''), input, folder);
      const toolUseId = String(block.id ?? '');

      if (tool.tasks !== undefined && parent == null) {
        tasks?.started(toolUseId, tool.tasks);
      }

      return {
        type: 'tool.started' as const,
        payload: {
          toolUseId,
          ...canonicalToolPayload(tool, input),
          ...titleOf(input),
          ...subagent,
          ...written,
        },
      };
    });

  return events(
    {
      type: 'message.completed',
      payload: {
        messageId,
        role: 'assistant',
        content: contentOf(blocks, uuid),
        ...subagent,
        ...written,
      },
    },
    ...started,
  );
}

/**
 * The label of a tool call: the `description` the model gave it, when it gave one in words (plan 22,
 * D-05). `Bash` always carries one; any other tool that does gets the same. Absent otherwise — the
 * client then shows the `label` alone.
 */
function titleOf(input: Readonly<Record<string, unknown>>): { readonly title?: string } {
  const description = input['description'];

  return typeof description === 'string' && description.trim() !== ''
    ? { title: description.trim() }
    : {};
}

/** An id the SDK gave, or `''` when it gave none — the type promises one, a release may not. */
function idOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** When an entry of the history was written, as the contract carries it — nothing when unknown. */
function atOf(at: string | undefined): { readonly at?: string } {
  return at === undefined ? {} : { at };
}

/**
 * A user message — which, in this stream, is usually the SDK reporting a tool result.
 *
 * A real prompt echoed back carries no `tool_result` block and produces a completed message, so
 * the client can show what was sent from the other device.
 */
function fromUser(
  message: Extract<SDKMessage, { type: 'user' }>,
  tasks: TaskListTracker,
): MappedMessage {
  return userEvents({
    messageId: message.uuid ?? '',
    uuid: message.uuid ?? '',
    content: message.message.content,
    parent: message.parent_tool_use_id,
    result: message.tool_use_result,
    tasks,
  });
}

/** The events of a user message, from its id and its content — live or read back. */
function userEvents({
  messageId,
  uuid,
  content,
  parent,
  result,
  at,
  tasks,
}: ReadMessage): MappedMessage {
  const blocks = asArray(content);
  const results = blocks.filter((block) => block.type === 'tool_result');
  const subagent = parentOf(parent);
  const written = atOf(at);

  if (results.length === 0) {
    return events({
      type: 'message.completed',
      payload: {
        messageId,
        role: 'user',
        content: contentOf(blocks, uuid),
        ...subagent,
        ...written,
      },
    });
  }

  return events(
    ...results.flatMap((block): SessionEvent[] => {
      const toolUseId = String(block.tool_use_id ?? '');
      const succeeded = block.is_error !== true;
      const task = taskOf(results.length === 1 ? result : undefined, block.content);
      const list =
        parent == null
          ? (tasks?.completed(toolUseId, { succeeded, taskId: task.taskId ?? null }) ?? null)
          : null;

      return [
        {
          type: 'tool.completed',
          payload: {
            toolUseId,
            status: succeeded ? 'succeeded' : 'failed',
            summary: summarise(block.content),
            ...subagent,
            ...written,
          },
        },
        ...(list === null ? [] : [tasksChanged(list, written)]),
      ];
    }),
  );
}

/** The task list as the contract carries it, after the call that changed it (plan 28, B-22). */
function tasksChanged(list: readonly TaskItem[], written: { readonly at?: string }): SessionEvent {
  return {
    type: 'session.tasksChanged',
    payload: {
      tasks: list.map((task) => ({
        id: task.id,
        title: task.title,
        ...(task.activeTitle === null ? {} : { activeTitle: task.activeTitle }),
        status: task.status,
      })),
      ...written,
    },
  };
}

/** How the CLI words the result of a `TaskCreate` — the only place the history keeps its id. */
const TASK_CREATED = /^Task #(\S+) created successfully/;

/**
 * The task of the list a `TaskCreate` made or a `TaskUpdate` changed, as `{ taskId }` — or nothing,
 * for every other tool (plan 08, B-20).
 *
 * Live, from the structured result: `{ task: { id } }` from a creation, `{ taskId }` from an update.
 * The transcript the SDK reads back has no structured result, and there the id of a new task is only
 * in the text of the result — read from the whole of it, never from the cut `summary`. One message
 * of the CLI carries one result, so a message with several is read by its text only.
 */
export function taskOf(result: unknown, content: unknown): { readonly taskId?: string } {
  if (isPlainObject(result)) {
    const task = result['task'];
    const id = isPlainObject(task) ? task['id'] : result['taskId'];
    if (typeof id === 'string') {
      return { taskId: id };
    }
  }

  const created = TASK_CREATED.exec(resultText(content));
  return created === null ? {} : { taskId: String(created[1]) };
}

/** The text of a `tool_result`, which is a string or a list of text blocks. */
export function resultText(content: unknown): string {
  return asArray(content)
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('');
}

/** The end of a turn, with what it used, what it cost, and whether it finished or crashed. */
function fromResult(
  message: Extract<SDKMessage, { type: 'result' }>,
  mapper: SdkMessageMapper,
): MappedMessage {
  return events({
    type: 'turn.completed',
    payload: {
      turnId: message.uuid,
      usage: usageOf(message.usage),
      // A string and not a number: money through a float is money that rounds where nobody looks.
      costUsd: mapper.turnCostOf(message.total_cost_usd).toFixed(6),
      durationMs: message.duration_ms,
      outcome: outcomeOf(message),
    },
  });
}

/**
 * How a `result` ended, in the three names the UI knows plus the one that catches the rest — never
 * the engine's own subtype (ADR-025, plan 27, B-10). A subtype this build does not recognise is
 * `failed`: an unlabelled failure is still the truth, where a guess at its label would not be.
 */
function outcomeOf(
  message: Extract<SDKMessage, { type: 'result' }>,
): TurnCompletedPayload['outcome'] {
  switch (message.subtype) {
    case 'success':
      return 'completed';
    case 'error_max_turns':
      return 'limitReached';
    case 'error_max_budget_usd':
      return 'budgetExceeded';
    default:
      return 'failed';
  }
}

/**
 * The Anthropic counts of a turn, in our names (plan 28, B-29) — each only when the SDK gave it as a
 * count. Thinking is inside the output tokens, and the API does not count it apart.
 */
function usageOf(usage: unknown): TurnCompletedPayloadUsage {
  const raw = isPlainObject(usage) ? usage : {};
  const tools = isPlainObject(raw['server_tool_use']) ? raw['server_tool_use'] : {};
  return {
    ...count('inputTokens', raw['input_tokens']),
    ...count('outputTokens', raw['output_tokens']),
    ...count('cacheReadTokens', raw['cache_read_input_tokens']),
    ...count('cacheWriteTokens', raw['cache_creation_input_tokens']),
    ...count('webSearches', tools['web_search_requests']),
  };
}

/** `{ [name]: value }` when [value] is a count, nothing otherwise. */
function count(name: keyof TurnCompletedPayloadUsage, value: unknown): TurnCompletedPayloadUsage {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? { [name]: value }
    : {};
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
export function historicalEvents(
  message: SessionMessage,
  folder: string,
  tasks?: TaskListTracker,
): readonly SessionEvent[] {
  const body = isPlainObject(message.message) ? message.message : {};
  const read = {
    folder,
    tasks,
    uuid: message.uuid,
    content: body['content'],
    parent: message.parent_tool_use_id,
    at: timestampOf(message),
  };

  switch (message.type) {
    case 'assistant':
      // The API's message id, exactly as the live `assistant` message carries it — that is the
      // key the client already accumulated deltas under.
      return assistantEvents({
        messageId: typeof body['id'] === 'string' ? body['id'] : message.uuid,
        ...read,
      }).events;

    case 'user':
      return userEvents({ messageId: message.uuid, ...read }).events;

    default:
      return [];
  }
}

/**
 * When the entry was written, as the transcript recorded it.
 *
 * The SDK returns the `timestamp` of every entry although `SessionMessage` does not declare it (SDK
 * 0.3.277, measured in plan 22). It marks the **end** of what the entry holds — the CLI files a block
 * when it closes —, so a duration read off two of them is an upper bound (D-14). Read defensively: a
 * release that drops it costs the duration, never the conversation.
 */
function timestampOf(message: SessionMessage): string | undefined {
  const timestamp: unknown = (message as SessionMessage & { readonly timestamp?: unknown })
    .timestamp;

  return typeof timestamp === 'string' && timestamp !== '' ? timestamp : undefined;
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

/**
 * A content block of our contract: the kind, plus the fields the contract names.
 *
 * Thinking goes in a field of its own, never in `text`, so a client that joins the text of every
 * block never shows it as the answer. Its signature never travels: it is the API's, and nothing a
 * client can read. A thinking the model sent empty — omitted, which is the default display — keeps
 * its block and no text: it says the model thought, and nothing it thought (plan 08, D-17).
 */
function toContentBlock(
  block: Record<string, unknown>,
  blockId: string | null,
): MessageCompletedPayloadContentItem {
  const type = blockKindOf(String(block['type'] ?? 'unknown'));
  const text = block['text'];
  const thinking = block['thinking'];
  const toolUseId = block['id'] ?? block['tool_use_id'];

  return {
    type,
    ...(blockId === null ? {} : { blockId }),
    ...(typeof text === 'string' ? { text } : {}),
    ...(type === 'thinking' && typeof thinking === 'string' && thinking !== '' ? { thinking } : {}),
    ...(typeof toolUseId === 'string' ? { toolUseId } : {}),
    ...(type === 'image' ? imageMarker(block['source']) : {}),
  };
}

/**
 * The block kinds of the Anthropic API, in our names (plan 28, B-30). A kind this build does not know
 * goes as the API named it, and the client shows it as a block it does not know (plan 27).
 */
const BLOCK_KINDS: ReadonlyMap<string, string> = new Map([
  ['redacted_thinking', 'redactedThinking'],
  ['tool_use', 'toolUse'],
  ['tool_result', 'toolResult'],
]);

/**
 * [type] of the API, as our contract names it. A map, not an object literal: a kind named
 * `constructor` would otherwise be renamed to the prototype's, and not pass through unchanged.
 */
function blockKindOf(type: string): string {
  return BLOCK_KINDS.get(type) ?? type;
}

/**
 * The blocks of an entry, each with its identity: `<uuid>:<index>` — the entry, and the block's place
 * in it (plan 22, D-06). The same block has the same id live and read back, read once or a hundred
 * times; two thinkings the model did not show are equal in kind and text, and still two.
 */
function contentOf(
  blocks: readonly Record<string, unknown>[],
  uuid: string,
): MessageCompletedPayloadContentItem[] {
  return blocks.map((block, index) =>
    toContentBlock(block, uuid === '' ? null : `${uuid}:${String(index)}`),
  );
}

/**
 * What an image block says of itself: its type, and its size in bytes — **never** the bytes (plan 22,
 * D-09). The image is fetched on demand, by its `blockId`; on the stream, in the replay buffer and in a
 * page it is a marker. An image given by URL has no size to say.
 */
function imageMarker(source: unknown): { readonly mediaType?: string; readonly size?: number } {
  if (!isPlainObject(source)) {
    return {};
  }

  const mediaType = source['media_type'];
  const data = source['data'];

  return {
    ...(typeof mediaType === 'string' && mediaType !== '' ? { mediaType } : {}),
    ...(source['type'] === 'base64' && typeof data === 'string' ? { size: base64Size(data) } : {}),
  };
}

/** How many lines of a tool's output the timeline keeps, and how many characters at most (D-07). */
export const SUMMARY_LINES = 5;
export const SUMMARY_CHARACTERS = 400;

/**
 * A short result for the timeline: the **end** of the output, as text (plan 22, D-07).
 *
 * Text, because a result made of blocks is their text joined — never the JSON of them, which reached
 * the screen as `[{"type":"text"…` until plan 22. The end, because that is where a build or a test says
 * how it went: the last {@link SUMMARY_LINES} lines, at most {@link SUMMARY_CHARACTERS} characters,
 * with `…` in front when anything was cut. Short on purpose, and never the whole thing: a `Read` of a
 * large file would otherwise put the file into the event stream, into the replay buffer and into
 * everybody's browser — the whole output is the route's (B-11).
 */
export function summarise(content: unknown): string {
  const lines = resultText(content).trimEnd().split('\n');
  const kept = lines.slice(-SUMMARY_LINES).join('\n');
  const tail = kept.slice(-SUMMARY_CHARACTERS);

  return lines.length > SUMMARY_LINES || tail.length < kept.length ? `…${tail}` : tail;
}

/** Message content, which the SDK gives as a string or as blocks, always as blocks. */
function asArray(content: unknown): Record<string, unknown>[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  return Array.isArray(content) ? content.filter(isPlainObject) : [];
}
