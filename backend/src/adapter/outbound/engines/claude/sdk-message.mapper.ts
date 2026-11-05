import type { SDKMessage, SDKResultError, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import { canonicalToolPayload } from '@application/session';
import type { SessionEvent } from '@application/session';
import type {
  MessageCompletedPayloadContentItem,
  ToolCompletedPayload,
  ToolCompletedPayloadAttachmentsItem,
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
import { SDK_VARIANT_CLASSIFICATION } from './sdk-message-classification';
import type { PendingInjected } from './sdk-message-notices';
import {
  agentInfoNotice,
  agentNotificationNotice,
  agentStoppingNotice,
  authFailedNotice,
  commandEchoNotice,
  commandOutputNotice,
  compactionFailedNotice,
  conversationResetNotice,
  hookFailedNotice,
  memoryRecalledNotice,
  modelRefusedNotice,
  modelSwitchedNotice,
  notice,
  pluginFailedNotice,
  requestRetryingNotice,
  unknownNotice,
} from './sdk-message-notices';

/** What a mapping produced: the events, and whatever the caller should log a warning about. */
export interface MappedMessage {
  readonly events: readonly SessionEvent[];

  /** Set when the variant is one this build does not know. The session carries on regardless. */
  readonly unknown: string | null;

  /**
   * Set when a `tool_result` carried a content block of a type this adapter does not know (B-14).
   * The event already has it as an `unknown` attachment (D-03's survival rule); this only drives a
   * log line of its own, distinct from {@link unknown}'s "unmapped SDK message variant" one — the
   * message here is perfectly well mapped, only one of its blocks is not.
   */
  readonly unknownAttachment?: string | null;
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

  /** A tool the CLI denied before its result arrived, read once by the `tool.completed` it changes. */
  private readonly deniedToolUseIds = new Map<string, string>();

  /** What the next synthetic, non-prompt `user` message is an injection of (B-11) — set once, read once. */
  private pendingInjected: PendingInjected | null = null;

  /** How many unknown variants this session has seen, for a `noticeId` when the message gave none. */
  private unknownOrdinal = 0;

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

  /** Remembers why a tool was denied, for the `tool.completed` its result produces (B-10, S-35/S-36). */
  recordDenial(toolUseId: string, reason: string): void {
    this.deniedToolUseIds.set(toolUseId, reason);
  }

  /** The reason [toolUseId] was denied, read once — a second result for the same id is ordinary. */
  consumeDenial(toolUseId: string): string | undefined {
    const reason = this.deniedToolUseIds.get(toolUseId);
    this.deniedToolUseIds.delete(toolUseId);
    return reason;
  }

  /** Marks the next synthetic message as this injection (B-11) — a compaction summary or a skill body. */
  notePendingInjected(value: PendingInjected): void {
    this.pendingInjected = value;
  }

  /** The injection the next synthetic message is, read once. `null` when nothing is pending. */
  consumePendingInjected(): PendingInjected | null {
    const value = this.pendingInjected;
    this.pendingInjected = null;
    return value;
  }

  /** A stable id for an unknown variant with no `uuid` of its own (B-13, S-52) — the session and an ordinal. */
  nextUnknownId(sessionId: unknown): string {
    const ordinal = this.unknownOrdinal;
    this.unknownOrdinal += 1;
    return typeof sessionId === 'string' && sessionId !== ''
      ? `unknown:${sessionId}:${String(ordinal)}`
      : `unknown:${String(ordinal)}`;
  }
}

/**
 * One handler per top-level `type` of `SDKMessage` — a `Record` over the union, so the compiler
 * itself proves every one of them is handled (plan 27, B-08): a release that adds a `type` to the
 * union fails `tsc` right here, the same guarantee the `never` of a switch would give, without the
 * cyclomatic cost of one big branch.
 */
const HANDLERS: {
  readonly [K in SDKMessage['type']]: (
    message: Extract<SDKMessage, { type: K }>,
    mapper: SdkMessageMapper,
  ) => MappedMessage;
} = {
  system: fromSystem,
  stream_event: fromStreamEvent,
  assistant: fromAssistant,
  user: fromUser,
  tool_progress: fromToolProgress,
  result: fromResult,
  rate_limit_event: fromRateLimitEvent,
  // The predicted-next-prompt feature is not wired (discovery §11): quiet.
  prompt_suggestion: () => NOTHING,
  // A label for a group of tools — the tool's own label is already ours (plan 26): quiet.
  tool_use_summary: () => NOTHING,
  auth_status: fromAuthStatus,
  conversation_reset: (message) => events(conversationResetNotice(message)),
};

function toEvents(message: SDKMessage, mapper: SdkMessageMapper): MappedMessage {
  // `HANDLERS[message.type]` genuinely is the handler built for this very branch of the union —
  // TypeScript just has no way to carry that correlation through a plain index, so the cast says
  // what indexing already guarantees at runtime. A message whose `type` is not a key at all (a
  // future SDK release, or `command_lifecycle`) reads `undefined` here, which is exactly the
  // survival rule's cue.
  const handler = (
    HANDLERS as Record<string, (message: SDKMessage, mapper: SdkMessageMapper) => MappedMessage>
  )[message.type];

  if (handler !== undefined) {
    return handler(message, mapper);
  }

  return QUIET_TYPES.has(typeOf(message))
    ? NOTHING
    : { events: [unknownOf(message, mapper)], unknown: describe(message) };
}

/** `tool_progress` — a running tool, still at it. */
function fromToolProgress(message: Extract<SDKMessage, { type: 'tool_progress' }>): MappedMessage {
  return events({
    type: 'tool.progress',
    payload: {
      toolUseId: message.tool_use_id,
      // The SDK reports elapsed time, not output. Sending the client an empty chunk would be a lie
      // about there being new content; the elapsed reading is what it actually has. The tool's name
      // stays out: the client has the label of its `tool.started` (plan 28, S-48).
      chunk: `${String(message.elapsed_time_seconds)}s`,
      ...parentOf(message.parent_tool_use_id),
    },
  });
}

/**
 * `rate_limit_event` — the session is alive and whatever it was doing it is still doing: this is a
 * notice, never a transition, and publishing it as `idle` — which this used to do — told a client
 * the session had stopped while the model was mid-answer, the one thing a status is for and the one
 * way it can lie. The usage screen already watches every one of these through `noteRateLimit`
 * (session-runner.ts); `usage.limited` is the conversation's **own** copy of the same news, emitted
 * only when the account is outside its normal 'allowed' state (B-09).
 */
function fromRateLimitEvent(
  message: Extract<SDKMessage, { type: 'rate_limit_event' }>,
): MappedMessage {
  const info = message.rate_limit_info;

  return info.status === 'allowed'
    ? NOTHING
    : events(
        notice({
          noticeId: message.uuid,
          kind: 'usage.limited',
          level: info.status === 'rejected' ? 'warning' : 'notice',
          native: 'rate_limit_event',
          messageKey: 'sessions.notice.usageLimited',
          params: {
            status: info.status,
            ...(typeof info.rateLimitType === 'string'
              ? { rateLimitType: info.rateLimitType }
              : {}),
          },
        }),
      );
}

/** `auth_status` — `auth.failed`, but only when it carries an error; the rest is quiet. */
function fromAuthStatus(message: Extract<SDKMessage, { type: 'auth_status' }>): MappedMessage {
  const error = message.error;
  return error === undefined || error === ''
    ? NOTHING
    : events(authFailedNotice({ ...message, error }));
}

/**
 * The `session.notice` of an unknown variant (B-13), with a `noticeId` stable even with no `uuid`.
 * [at] is read back only (B-18) — live, an unknown variant has no entry to stamp a time from.
 */
function unknownOf(raw: unknown, mapper: SdkMessageMapper, at?: string): SessionEvent {
  const uuid = isPlainObject(raw) ? raw['uuid'] : undefined;
  const sessionId = isPlainObject(raw) ? raw['session_id'] : undefined;
  const noticeId = typeof uuid === 'string' && uuid !== '' ? uuid : mapper.nextUnknownId(sessionId);

  return unknownNotice(raw, noticeId, describe(raw), at);
}

/**
 * The top-level `type`s this build knows are quiet without being in {@link HANDLERS} at all —
 * `command_lifecycle`, which the typed union of the SDK does not name: `queued`/`started` is the CLI
 * acknowledging a prompt streamed with a uuid, which every prompt of ours is (plan 08, F6, recorded in
 * `stamped-turn`). The queue of prompts is the backend's own (D-14), and it already says when a
 * prompt waits, starts or leaves.
 *
 * Read from {@link SDK_VARIANT_CLASSIFICATION} rather than written out again: a top-level entry
 * classified `quiet` there that {@link HANDLERS} does not otherwise cover is, by construction, one of
 * these — the one list the classification table and the dispatch table could otherwise drift apart on.
 */
const QUIET_TYPES: ReadonlySet<string> = new Set(
  SDK_VARIANT_CLASSIFICATION.filter(
    (row) => row.list === 'quiet' && !row.variant.includes(':') && !(row.variant in HANDLERS),
  ).map((row) => row.variant),
);

/** The `type` of a message, whatever the message is. */
function typeOf(message: unknown): string {
  return isPlainObject(message) ? String(message['type'] ?? 'absent') : 'not an object';
}

type SystemMessage = Extract<SDKMessage, { type: 'system' }>;

/**
 * One handler per `subtype` of the `system` family — the same `Record`-over-the-union guarantee as
 * {@link HANDLERS}, and for the same reason (plan 27, B-08): the family is 28 unrelated things under
 * one `type`, and a single `switch` over all of them had a cyclomatic cost no reviewer could really
 * hold in their head. Every subtype is in exactly one of three lists — mapped, warning, quiet — with
 * the reason recorded in `sdk-message-classification.ts` (B-09).
 */
const SYSTEM_HANDLERS: {
  readonly [K in SystemMessage['subtype']]: (
    message: Extract<SystemMessage, { subtype: K }>,
    mapper: SdkMessageMapper,
  ) => MappedMessage;
} = {
  // Deliberately nothing. Our `session.started` is published when the session is opened, with
  // **our** id, our workspace and the mode we asked for; this message says the same things in the
  // SDK's own vocabulary, with the SDK's own session id. Emitting it would put a second
  // `session.started` on the stream carrying an id no client of ours can do anything with.
  //
  // The SDK's id is what a `resume` will need, and that is the transcript plan's to collect — from
  // `SDKSessionInfo`, not from a contract event that lies about which session it is.
  init: () => NOTHING,

  // The conversation was compacted: what came before is a summary now. Said on its own, so a client
  // keeping the turns on screen can mark the point (plan 08, B-02). The synthetic messages the CLI
  // sends right after this one are the summary and its echo (B-11); this is what tells the `user`
  // branch that is what they are.
  compact_boundary: (message, mapper) => {
    mapper.notePendingInjected({ kind: 'contextSummary' });
    return events({
      type: 'session.compacted',
      payload: {
        trigger: message.compact_metadata.trigger,
        preTokens: message.compact_metadata.pre_tokens,
        // The entry's own uuid — stable live, in replay and read back from history (B-18), where it
        // is the only field a bare system placeholder still carries.
        compactionId: message.uuid,
      },
    });
  },

  // The menu changed mid-session — a skill discovered as the agent works in a subdirectory, say.
  // The push already carries the whole list, so the client replaces its menu with this instead of
  // asking `supportedCommands()` again (found live, plan 28, B-46).
  commands_changed: (message) =>
    events({
      type: 'session.commandsChanged',
      payload: { commands: menuOf(message.commands.map(toSlashCommand), CLAUDE_COMMAND_MENU) },
    }),

  // The status stays `thinking` — unchanged since plan 08 — and a notice now carries the numbers
  // the status alone cannot: which attempt this is, how many are left, how long it will wait (B-09).
  api_retry: (message) =>
    events(
      { type: 'session.statusChanged', payload: { status: 'thinking' } },
      requestRetryingNotice(message),
    ),

  // Progress of a control request of our own (a toggle, a reconnect) — `askControl` already times
  // and logs it. Quiet.
  control_request_progress: () => NOTHING,

  model_refusal_fallback: (message) => events(modelSwitchedNotice(message)),
  model_refusal_no_fallback: (message) => events(modelRefusedNotice(message)),
  local_command_output: (message) => events(commandOutputNotice(message)),

  // Lifecycle only — the result (`hook_response`) is what interests a client. Quiet.
  hook_started: () => NOTHING,
  hook_progress: () => NOTHING,

  informational: (message) => events(agentInfoNotice(message)),

  // `success`/`cancelled` are quiet: the hook did what it does without anything to tell.
  hook_response: (message) =>
    message.outcome === 'error' ? events(hookFailedNotice(message)) : NOTHING,

  // Every other status (`started`, `installed`, `completed`) is quiet.
  plugin_install: (message) =>
    message.status === 'failed' ? events(pluginFailedNotice(message)) : NOTHING,

  // A subagent's own messages and tools draw it — nothing here for the main timeline. Quiet.
  task_notification: () => NOTHING,
  task_started: () => NOTHING,
  task_updated: () => NOTHING,
  task_progress: () => NOTHING,
  background_tasks_changed: () => NOTHING,

  // A running counter, nothing for the timeline. Quiet.
  thinking_tokens: () => NOTHING,

  // Our own session status is already published. Quiet.
  session_state_changed: () => NOTHING,

  worker_shutting_down: (message) => events(agentStoppingNotice(message)),
  notification: (message) => events(agentNotificationNotice(message)),

  // The Files API is not used (discovery §11). Quiet.
  files_persisted: () => NOTHING,

  memory_recall: (message) => events(memoryRecalledNotice(message)),

  // MCP elicitation is not supported (discovery §11). Quiet.
  elicitation_complete: () => NOTHING,

  // The CLI denied this tool before it ran. The `tool_result` that follows (or, rarely, already
  // arrived) is what tells the client — as `tool.completed` with `status: 'denied'` (B-10) — never
  // a notice of its own.
  permission_denied: (message, mapper) => {
    mapper.recordDenial(message.tool_use_id, message.message);
    return NOTHING;
  },

  // A mirrored SessionStore batch failed — not used by this product, so there is nothing to tell a
  // client. Quiet.
  mirror_error: () => NOTHING,

  // `compact_result` other than `'failed'` (including absent) is quiet.
  status: (message) =>
    message.compact_result === 'failed' ? events(compactionFailedNotice(message)) : NOTHING,
};

/** The `system` family, which is several unrelated things under one `type` — dispatched by {@link SYSTEM_HANDLERS}. */
function fromSystem(message: SystemMessage, mapper: SdkMessageMapper): MappedMessage {
  // Same correlation `HANDLERS` relies on in `toEvents`: `message.subtype` picked this very entry.
  const handler = (
    SYSTEM_HANDLERS as Record<
      string,
      (message: SystemMessage, mapper: SdkMessageMapper) => MappedMessage
    >
  )[message.subtype];

  return handler !== undefined
    ? handler(message, mapper)
    : { events: [unknownOf(message, mapper)], unknown: describe(message) };
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
    onSkillStarted: (toolUseId, name) =>
      mapper.notePendingInjected({
        kind: 'instructions',
        parentToolUseId: toolUseId,
        ...(name === undefined ? {} : { name }),
      }),
  });
}

/** The qualified name a `Skill` tool call was given, or `undefined` when its input carries none. */
function skillNameOf(input: Readonly<Record<string, unknown>>): string | undefined {
  const skill = input['skill'];
  return typeof skill === 'string' && skill !== '' ? skill : undefined;
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

  /** Live only: called for every `Skill` tool call opened, so B-11 can mark its injected body. */
  readonly onSkillStarted?: (toolUseId: string, name: string | undefined) => void;

  /** Live only: the reason [toolUseId] was denied by the CLI, if any — consumed once (B-10). */
  readonly denialOf?: (toolUseId: string) => string | undefined;
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
  onSkillStarted,
}: ReadMessage): MappedMessage {
  const blocks = asArray(content);
  const subagent = parentOf(parent);
  const written = atOf(at);

  const started = blocks
    .filter((block) => block.type === 'tool_use')
    .map((block) => {
      const input = isPlainObject(block.input) ? block.input : {};
      const name = String(block.name ?? '');
      const tool = classifyTool(name, input, folder);
      const toolUseId = String(block.id ?? '');

      if (tool.tasks !== undefined && parent == null) {
        tasks?.started(toolUseId, tool.tasks);
      }

      if (name === 'Skill') {
        onSkillStarted?.(toolUseId, skillNameOf(input));
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
  mapper: SdkMessageMapper,
): MappedMessage {
  // `isReplay` only exists, in the SDK's own types, on `SDKUserMessageReplay` — read dynamically
  // rather than forcing every caller of this branch to narrow a union neither flag discriminates.
  const flags = message as { readonly isSynthetic?: boolean; readonly isReplay?: boolean };

  return userEvents({
    messageId: message.uuid ?? '',
    uuid: message.uuid ?? '',
    content: message.message.content,
    parent: message.parent_tool_use_id,
    result: message.tool_use_result,
    tasks: mapper.tasks,
    denialOf: (toolUseId) => mapper.consumeDenial(toolUseId),
    isSynthetic: flags.isSynthetic === true,
    isReplay: flags.isReplay === true,
    resolveInjected: () => mapper.consumePendingInjected(),
  });
}

/**
 * The events of a user message, from its id and its content — live or read back.
 *
 * `isSynthetic`/`isReplay`/`resolveInjected` are live-only (B-11): the SDK types the two flags on
 * `SDKUserMessage`/`SDKUserMessageReplay`, never on the plain `SessionMessage` the transcript reads
 * back, and a historical read has no mapper to carry a pending injection across messages — that
 * wiring is F5's, not F3's.
 */
function userEvents({
  messageId,
  uuid,
  content,
  parent,
  result,
  at,
  tasks,
  denialOf,
  isSynthetic = false,
  isReplay = false,
  resolveInjected,
}: ReadMessage & {
  readonly isSynthetic?: boolean;
  readonly isReplay?: boolean;
  readonly resolveInjected?: () => PendingInjected | null;
}): MappedMessage {
  const blocks = asArray(content);
  const results = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.type === 'tool_result');
  const subagent = parentOf(parent);
  const written = atOf(at);

  if (results.length === 0) {
    return promptEvents({
      messageId,
      uuid,
      blocks,
      subagent,
      written,
      echo: isReplay ? localCommandEchoOf(content) : null,
      injected: isSynthetic ? (resolveInjected?.() ?? { kind: 'contextSummary' }) : null,
    });
  }

  const mapped = results.map(({ block, index }) =>
    toolResultEvents(block, {
      subagent,
      written,
      parent,
      tasks,
      denialOf,
      result,
      resultCount: results.length,
      uuid,
      blockIndex: index,
    }),
  );
  const unknownAttachment =
    mapped.map((one) => one.unknownBlock).find((type) => type !== null) ?? null;

  return {
    events: mapped.flatMap((one) => one.events),
    unknown: null,
    ...(unknownAttachment === null ? {} : { unknownAttachment }),
  };
}

/** The non-tool-result branch of a `user` message: a prompt, its echo, or an injected message (B-11). */
function promptEvents(fields: {
  readonly messageId: string;
  readonly uuid: string;
  readonly blocks: readonly Record<string, unknown>[];
  readonly subagent: { readonly parentToolUseId?: string };
  readonly written: { readonly at?: string };
  readonly echo: string | null;
  readonly injected: PendingInjected | null;
}): MappedMessage {
  if (fields.echo !== null) {
    // The eco and the `local_command_output` of the same output both reach the client (D-07): no
    // suppression, even when the two duplicate the same text.
    return events(commandEchoNotice(fields.uuid, fields.echo));
  }

  const injected =
    fields.injected === null
      ? {}
      : {
          injected: {
            kind: fields.injected.kind,
            ...(fields.injected.name === undefined ? {} : { name: fields.injected.name }),
          },
          ...(fields.injected.parentToolUseId === undefined
            ? {}
            : { parentToolUseId: fields.injected.parentToolUseId }),
        };

  // A real prompt — typed here, or echoed from another device (`isReplay`, no tag) — is shown as is
  // when [injected] is empty; an injection (a compaction summary, a skill's body) carries its own
  // `injected` field instead, and never reaches the model as a prompt again.
  return events({
    type: 'message.completed',
    payload: {
      messageId: fields.messageId,
      role: 'user',
      content: contentOf(fields.blocks, fields.uuid),
      ...fields.subagent,
      ...injected,
      ...fields.written,
    },
  });
}

/** `denied` when the CLI denied this tool before it ran (B-10); `succeeded`/`failed` otherwise. */
function toolOutcomeOf(
  succeeded: boolean,
  denialReason: string | undefined,
): { readonly status: 'denied' | 'succeeded' | 'failed'; readonly summary: string | undefined } {
  return denialReason !== undefined
    ? { status: 'denied', summary: denialReason }
    : { status: succeeded ? 'succeeded' : 'failed', summary: undefined };
}

/** One `tool_result` block of a `user` message → its `tool.completed`, and a task change if any (B-10). */
function toolResultEvents(
  block: Record<string, unknown>,
  fields: {
    readonly subagent: { readonly parentToolUseId?: string };
    readonly written: { readonly at?: string };
    readonly parent: string | null | undefined;
    readonly tasks: TaskListTracker | undefined;
    readonly denialOf: ((toolUseId: string) => string | undefined) | undefined;
    readonly result: unknown;
    readonly resultCount: number;
    readonly uuid: string;
    readonly blockIndex: number;
  },
): { readonly events: SessionEvent[]; readonly unknownBlock: string | null } {
  const toolUseId = String(block.tool_use_id ?? '');
  const succeeded = block.is_error !== true;
  const outcome = toolOutcomeOf(succeeded, fields.denialOf?.(toolUseId));
  const list = taskListChangeOf(toolUseId, succeeded, block.content, fields);
  const { attachments, unknownBlock } = attachmentsOf(
    fields.uuid,
    fields.blockIndex,
    block.content,
  );

  return {
    events: [
      {
        type: 'tool.completed',
        payload: {
          toolUseId,
          status: outcome.status,
          summary: outcome.summary ?? summarise(block.content),
          ...fields.subagent,
          ...fields.written,
          ...(attachments === undefined ? {} : { attachments }),
        },
      },
      ...(list === null ? [] : [tasksChanged(list, fields.written)]),
    ],
    unknownBlock,
  };
}

/** The task list, after this result changed it — `null` on a subagent's, or when nothing tracks it. */
function taskListChangeOf(
  toolUseId: string,
  succeeded: boolean,
  content: unknown,
  fields: {
    readonly parent: string | null | undefined;
    readonly tasks: TaskListTracker | undefined;
    readonly result: unknown;
    readonly resultCount: number;
  },
): readonly TaskItem[] | null {
  if (fields.parent != null) {
    return null;
  }

  const task = taskOf(fields.resultCount === 1 ? fields.result : undefined, content);
  return fields.tasks?.completed(toolUseId, { succeeded, taskId: task.taskId ?? null }) ?? null;
}

/** How many attachments one `tool_result` carries at most — the contract's own ceiling (B-14). */
const MAX_ATTACHMENTS = 16;

/**
 * The attachments of a `tool_result`'s content: an `image` block becomes a marker (never its bytes),
 * a block of a type this adapter does not know becomes `unknown` with its `type` (D-03's survival
 * rule) — and [unknownBlock] names it, for the caller's log line (plan 27, B-14).
 *
 * `text` blocks are not attachments: they are already in `summary`/the full result (plan 22). That
 * also covers the MCP `resource` and `resource_link` content types — measured in F0 (B-01) to never
 * reach here as their own block type, because the CLI already flattens both into `text` before this
 * message is built (`[Resource …] …`, `[Resource link: …] …`). Text is enough for that pair, so
 * neither gets a dedicated `kind` here.
 */
function attachmentsOf(
  uuid: string,
  blockIndex: number,
  content: unknown,
): {
  readonly attachments: ToolCompletedPayload['attachments'];
  readonly unknownBlock: string | null;
} {
  let unknownBlock: string | null = null;

  const attachments: ToolCompletedPayloadAttachmentsItem[] = asArray(content).flatMap(
    (inner, innerIndex): ToolCompletedPayloadAttachmentsItem[] => {
      const type = inner.type;

      if (type === 'text') {
        return [];
      }

      if (type === 'image') {
        const image = imageAttachmentOf(inner);
        if (image !== null) {
          return [
            {
              kind: 'image',
              blockId: `${uuid}:${String(blockIndex)}:${String(innerIndex)}`,
              ...image,
            },
          ];
        }
      }

      unknownBlock = typeof type === 'string' && type !== '' ? type : 'unknown';
      return [{ kind: 'unknown', type: unknownBlock }];
    },
  );

  return {
    attachments: attachments.length === 0 ? undefined : attachments.slice(0, MAX_ATTACHMENTS),
    unknownBlock,
  };
}

/** An `image` block's bytes, read only for their size — the base64 itself never leaves this function. */
function imageAttachmentOf(
  block: Record<string, unknown>,
): { readonly mediaType?: string; readonly size: number } | null {
  const source = block.source;
  if (!isPlainObject(source) || source['type'] !== 'base64') {
    return null;
  }

  const data = source['data'];
  if (typeof data !== 'string') {
    return null;
  }

  const mediaType = source['media_type'];
  return {
    ...(typeof mediaType === 'string' && mediaType !== '' ? { mediaType } : {}),
    size: base64Size(data),
  };
}

/** The text of a `<local-command-stdout>` echo, tag stripped — `null` when [content] is not one (B-11). */
const LOCAL_COMMAND_ECHO = /^<local-command-stdout>([\s\S]*)<\/local-command-stdout>$/;

function localCommandEchoOf(content: unknown): string | null {
  if (typeof content !== 'string') {
    return null;
  }

  const match = LOCAL_COMMAND_ECHO.exec(content);
  return match === null ? null : (match[1] ?? '');
}

/**
 * The `/command args` a `<command-name>`/`<command-args>` expansion was typed as — tags stripped,
 * `null` when [content] carries none (B-17, history only).
 *
 * Live, the backend already shows the prompt it itself sent (F0, B-01 measured no echo of this tag
 * at all): the expansion only ever reaches a client through history, where it is the sole surviving
 * record of what was typed (plan 27, discovery §6). The two tags are read independently, never by a
 * fixed order — a project's own `/command` was measured with `<command-message>` first,
 * `/compact`'s own with `<command-name>` first.
 */
const COMMAND_NAME = /<command-name>([^<]*)<\/command-name>/;
const COMMAND_ARGS = /<command-args>([^<]*)<\/command-args>/;

function commandExpansionOf(content: unknown): string | null {
  if (typeof content !== 'string') {
    return null;
  }

  const name = COMMAND_NAME.exec(content)?.[1];
  if (name === undefined) {
    return null;
  }

  const args = COMMAND_ARGS.exec(content)?.[1] ?? '';
  return args === '' ? name : `${name} ${args}`;
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
  const outcome = outcomeOf(message);
  const completed: SessionEvent = {
    type: 'turn.completed',
    payload: {
      turnId: message.uuid,
      usage: usageOf(message.usage),
      // A string and not a number: money through a float is money that rounds where nobody looks.
      costUsd: mapper.turnCostOf(message.total_cost_usd).toFixed(6),
      durationMs: message.duration_ms,
      outcome,
    },
  };

  // 'success' is the only subtype `fromResult` ever sees with `outcome: 'completed'` — an error
  // subtype always gets the `turn.failed` notice alongside, with the `errors[]` text the UI's own
  // turn row never carries (B-10). The cast is the runtime fact `outcome` just established: every
  // other `TurnCompletedPayload['outcome']` comes from an `SDKResultError`, never success.
  return outcome === 'completed'
    ? events(completed)
    : events(completed, turnFailedNotice(message as SDKResultError));
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

/** `turn.failed` — the turn ended in error, with the `errors[]` text cut at the usual ceiling (D-13). */
function turnFailedNotice(message: SDKResultError): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'turn.failed',
    level: 'error',
    native: `result:${message.subtype}`,
    params: { reason: turnFailureReasonOf(message.subtype) },
    text: message.errors.join('\n'),
  });
}

/** `params.reason` of a `turn.failed` notice — `'other'` for a subtype this build does not recognise. */
function turnFailureReasonOf(
  subtype: SDKResultError['subtype'],
): 'execution' | 'maxTurns' | 'budget' | 'other' {
  switch (subtype) {
    case 'error_during_execution':
      return 'execution';
    case 'error_max_turns':
      return 'maxTurns';
    case 'error_max_budget_usd':
      return 'budget';
    default:
      return 'other';
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
 * `mapper` is one per **whole read** (plan 27, F5, B-17) — the same instance for every entry of a
 * conversation, exactly like the live stream's — so a `Skill` tool call opened by an `assistant`
 * entry still marks the synthetic `user` entry right after it as `injected`, and the bare `system`
 * placeholder a compaction leaves still primes the summary that follows it. A fresh mapper per
 * message would carry none of that across entries, and every one of those links would silently
 * break.
 */
export function historicalEvents(
  message: SessionMessage,
  mapper: SdkMessageMapper,
): readonly SessionEvent[] {
  const body = isPlainObject(message.message) ? message.message : {};
  const read = {
    folder: mapper.folder,
    tasks: mapper.tasks,
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
        onSkillStarted: (toolUseId, name) =>
          mapper.notePendingInjected({
            kind: 'instructions',
            parentToolUseId: toolUseId,
            ...(name === undefined ? {} : { name }),
          }),
        ...read,
      }).events;

    case 'user':
      return historicalUserEvents(message, read, mapper);

    case 'system':
      return historicalSystemEvents(message, mapper, read.at);

    default:
      // A `command_lifecycle` or any other top-level type history might one day carry — never
      // measured, so the same survival rule as an unknown live variant applies (B-13).
      return [unknownOf(message, mapper, read.at)];
  }
}

/**
 * A `system` entry read back from history (B-17).
 *
 * Measured (F5, B-01 extended): history carries no `subtype` and no payload for a `system` entry at
 * all — not the rich `compact_metadata` a live `compact_boundary` has, not even a name for what kind
 * of event it was. Every one observed was the trace a compaction leaves; nothing else does (a denied
 * tool, a hook message, a retried request — none leaves any `system` entry in history, of any kind).
 * So a bare entry is treated as the compaction boundary itself, which primes the synthetic summary
 * right after it the same way the live handler does; a subtype some future SDK release does persist
 * falls to the same `unknown` line an unmapped live variant does (B-13) — never silently dropped,
 * which is the U-03 bug this phase exists to close.
 */
function historicalSystemEvents(
  message: SessionMessage,
  mapper: SdkMessageMapper,
  at: string | undefined,
): readonly SessionEvent[] {
  const subtype = (message as { readonly subtype?: unknown }).subtype;

  if (subtype !== undefined) {
    return [unknownOf(message, mapper, at)];
  }

  mapper.notePendingInjected({ kind: 'contextSummary' });
  return [
    {
      type: 'session.compacted',
      payload: {
        // History gives no field to tell `manual` from `auto` apart (no `compact_metadata`
        // survives) — `manual` is the documented best effort: every compaction this plan measured
        // live was a typed `/compact` (F5, as-built note; revisit if the SDK ever persists the
        // trigger to history).
        trigger: 'manual',
        compactionId: message.uuid,
      },
    },
  ];
}

/**
 * A `user` entry read back from history (B-17), through the same {@link userEvents} the live stream
 * uses — only how its flags are read differs, because history names them differently than the live
 * stream does (measured, F5): `isCompactSummary`/`is_meta` where live has `isSynthetic`,
 * `isCompletedLocalCommand` where live has `isReplay`. A project's own `/command` carries neither
 * flag at all — its expansion is found by the tag itself, `commandExpansionOf`, which also covers the
 * flagged built-in commands (`/compact`, `/cost`) the same way.
 *
 * A denied tool is not recoverable from history (measured, F5 as-built note): no `system` entry marks
 * it, and its `tool_result` reads exactly like an ordinary failure — `is_error: true`, human prose a
 * client must never parse for a decision (D-03). It shows as `status: 'failed'`, same as any other
 * failed call; B-10's `status: 'denied'` is live only.
 */
function historicalUserEvents(
  message: SessionMessage,
  read: {
    readonly folder: string;
    readonly tasks: TaskListTracker;
    readonly uuid: string;
    readonly content: unknown;
    readonly parent: string | null | undefined;
    readonly at: string | undefined;
  },
  mapper: SdkMessageMapper,
): readonly SessionEvent[] {
  const flags = message as {
    readonly isCompactSummary?: boolean;
    readonly is_meta?: boolean;
    readonly isCompletedLocalCommand?: boolean;
  };
  const expansion = commandExpansionOf(read.content);

  return userEvents({
    messageId: message.uuid,
    ...read,
    content: expansion ?? read.content,
    isSynthetic: flags.isCompactSummary === true || flags.is_meta === true,
    isReplay: expansion === null && flags.isCompletedLocalCommand === true,
    resolveInjected: () => mapper.consumePendingInjected(),
  }).events;
}

/**
 * When the entry was written, as the transcript recorded it.
 *
 * The SDK returns the `timestamp` of every entry although `SessionMessage` does not declare it (SDK
 * 0.3.277, measured in plan 22). It marks the **end** of what the entry holds — the CLI files a block
 * when it closes —, so a duration read off two of them is an upper bound (D-14). Read defensively: a
 * release that drops it costs the duration, never the conversation.
 */
export function timestampOf(message: SessionMessage): string | undefined {
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
