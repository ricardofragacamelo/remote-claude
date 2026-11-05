import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import type { SessionEvent } from '@application/session';
import type {
  MessageCompletedPayloadInjected,
  NoticeSubject,
  SessionNoticePayload,
} from '@remote-claude/contracts';
import { SESSION_NOTICE_PAYLOAD_LIMITS } from '@remote-claude/contracts';
import { isPlainObject } from '@shared/utils/plain-object';
import { CLAUDE_ENGINE } from './claude-engine';

/**
 * The canonical `kind` → SDK variant map of [§8.2](../../../../../docs/discovery/09-perdas-do-backend-na-conversa.md#82-o-evento-de-aviso),
 * decided by this file alone (plan 27, B-09) — the application and the two clients only ever see the
 * first column. `memory.recalled`, `conversation.reset`, `hook.failed` and `extension.failed` are not
 * kinds of their own: none had a capacity declared in `EngineCapabilities`, so the D-10 of the plan
 * folds all four into `agent.info` — the text and the `subject` still say what happened, only the
 * `kind` reads flatter.
 */

/** Cuts [raw] to the ceiling the schema gives `session.notice.text` (D-13), and says whether it did. */
export function noticeText(raw: string): { readonly text: string; readonly truncated?: true } {
  const max = SESSION_NOTICE_PAYLOAD_LIMITS.text.maxLength;
  return raw.length > max ? { text: raw.slice(0, max), truncated: true } : { text: raw };
}

/** What a `session.notice` is built from, before the shape the contract wants. */
export interface NoticeFields {
  readonly noticeId: string;
  readonly kind: string;
  readonly level: SessionNoticePayload['level'];
  /** The engine's own name for the message this notice is of — `origin.native` (opaque, diagnosis only). */
  readonly native: string;
  readonly messageKey?: string;
  readonly params?: Readonly<Record<string, unknown>>;
  /** Untrusted prose, from the agent, a hook or a command — never set together with `messageKey`. */
  readonly text?: string;
  readonly subject?: NoticeSubject;
  readonly parentToolUseId?: string;
  /** When the entry was written — read back only, same as every other historical event (B-18). */
  readonly at?: string;
}

/** One `session.notice` event, with `origin` filled in from {@link NoticeFields.native}. */
export function notice(fields: NoticeFields): SessionEvent {
  const cut = fields.text === undefined ? {} : noticeText(fields.text);

  return {
    type: 'session.notice',
    payload: {
      noticeId: fields.noticeId,
      kind: fields.kind,
      level: fields.level,
      origin: { engine: CLAUDE_ENGINE, native: fields.native },
      ...(fields.messageKey === undefined ? {} : { messageKey: fields.messageKey }),
      ...(fields.params === undefined ? {} : { params: fields.params }),
      ...cut,
      ...(fields.subject === undefined ? {} : { subject: fields.subject }),
      ...(fields.parentToolUseId === undefined ? {} : { parentToolUseId: fields.parentToolUseId }),
      ...(fields.at === undefined ? {} : { at: fields.at }),
    },
  };
}

/** What the next synthetic, non-prompt `user` message is an injection of (B-11) — set once, read once. */
export interface PendingInjected {
  readonly kind: MessageCompletedPayloadInjected['kind'];
  readonly name?: string;
  readonly parentToolUseId?: string;
}

type ApiRetry = Extract<SDKMessage, { type: 'system'; subtype: 'api_retry' }>;
type ModelRefusalFallback = Extract<
  SDKMessage,
  { type: 'system'; subtype: 'model_refusal_fallback' }
>;
type ModelRefusalNoFallback = Extract<
  SDKMessage,
  { type: 'system'; subtype: 'model_refusal_no_fallback' }
>;
type LocalCommandOutput = Extract<SDKMessage, { type: 'system'; subtype: 'local_command_output' }>;
type Informational = Extract<SDKMessage, { type: 'system'; subtype: 'informational' }>;
type HookResponse = Extract<SDKMessage, { type: 'system'; subtype: 'hook_response' }>;
type PluginInstall = Extract<SDKMessage, { type: 'system'; subtype: 'plugin_install' }>;
type MemoryRecall = Extract<SDKMessage, { type: 'system'; subtype: 'memory_recall' }>;
type WorkerShuttingDown = Extract<SDKMessage, { type: 'system'; subtype: 'worker_shutting_down' }>;
type Notification = Extract<SDKMessage, { type: 'system'; subtype: 'notification' }>;
type StatusMessage = Extract<SDKMessage, { type: 'system'; subtype: 'status' }>;
type AuthStatus = Extract<SDKMessage, { type: 'auth_status' }>;
type ConversationReset = Extract<SDKMessage, { type: 'conversation_reset' }>;

/** `request.retrying` — the model request will be tried again (`system:api_retry`). */
export function requestRetryingNotice(message: ApiRetry): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'request.retrying',
    level: 'notice',
    native: 'system:api_retry',
    messageKey: 'sessions.notice.requestRetrying',
    params: {
      attempt: message.attempt,
      maxAttempts: message.max_retries,
      delayMs: message.retry_delay_ms,
    },
    ...subagentOf(message),
  });
}

/**
 * `model.switched` — a refusal was answered by the fallback model instead (`model_refusal_fallback`).
 *
 * Never the `message.retracted` the discovery's own draft proposed alongside it: the live spike could
 * not confirm the `retracted_message_uuids` line up with a client's own ids (D-06), so no retraction is
 * emitted — only the notice that the model changed. The reason is always `'refusal'`: the SDK has no
 * variant for a fallback caused by overload (measured, B-01, sonda 3).
 */
export function modelSwitchedNotice(message: ModelRefusalFallback): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'model.switched',
    level: 'warning',
    native: 'system:model_refusal_fallback',
    messageKey: 'sessions.notice.modelSwitched',
    params: { from: message.original_model, to: message.fallback_model, reason: 'refusal' },
    ...subagentOf(message),
  });
}

/** `model.refused` — the model refused to answer, with no fallback (`model_refusal_no_fallback`). */
export function modelRefusedNotice(message: ModelRefusalNoFallback): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'model.refused',
    level: 'warning',
    native: 'system:model_refusal_no_fallback',
    text: message.content,
    ...subagentOf(message),
  });
}

/** `command.output` — a local slash command's own output (`local_command_output`). */
export function commandOutputNotice(message: LocalCommandOutput): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'command.output',
    level: 'info',
    native: 'system:local_command_output',
    text: message.content,
    ...subagentOf(message),
  });
}

/**
 * `command.output` — the same notice, from the `<local-command-stdout>` echo a `user` message carries
 * instead of the `local_command_output` system message (B-11). Shown alongside a `local_command_output`
 * of the same output rather than instead of it (D-07): no correlation, no suppression.
 */
export function commandEchoNotice(noticeId: string, text: string): SessionEvent {
  return notice({
    noticeId,
    kind: 'command.output',
    level: 'info',
    native: 'user:local-command-stdout',
    text,
  });
}

/**
 * `agent.info` — the CLI's generic banner (`informational`), which is also where a hook's own
 * `systemMessage` arrives (measured, B-01, sonda 2: never on `hook_response`). `prevent_continuation`
 * rides as a structured parameter alongside the untrusted text, because the client needs to know a
 * `Stop` hook ended the turn even though the text itself is not ours to translate.
 */
export function agentInfoNotice(message: Informational): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'agent.info',
    level: levelOfInformational(message.level),
    native: 'system:informational',
    text: message.content,
    ...(message.prevent_continuation === true ? { params: { preventContinuation: true } } : {}),
    ...subagentOf(message),
  });
}

function levelOfInformational(level: Informational['level']): SessionNoticePayload['level'] {
  switch (level) {
    case 'info':
      return 'info';
    case 'notice':
      return 'notice';
    default:
      // 'suggestion' and 'warning': the SDK's own doc groups the two as "more prominent".
      return 'warning';
  }
}

/** `agent.notification` — the CLI's REPL notification queue (`notification`). */
export function agentNotificationNotice(message: Notification): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'agent.notification',
    level: message.priority === 'high' || message.priority === 'immediate' ? 'warning' : 'notice',
    native: 'system:notification',
    text: message.text,
    ...subagentOf(message),
  });
}

/**
 * `agent.info` — a hook failed (`hook_response` with `outcome: 'error'`). Folded from the `hook.failed`
 * the discovery drafted (D-10): no `EngineCapabilities` flag exists for hooks, so it is generic like
 * every other Claude-only concept without one. `outcome: 'success'`/`'cancelled'` stay quiet.
 */
export function hookFailedNotice(message: HookResponse): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'agent.info',
    level: 'warning',
    native: 'system:hook_response',
    text: message.stderr !== '' ? message.stderr : message.output,
    subject: { hook: message.hook_name, trigger: message.hook_event },
    ...subagentOf(message),
  });
}

/**
 * `agent.info` — a plugin failed to install (`plugin_install` with `status: 'failed'`). Folded from the
 * `extension.failed` the discovery drafted (D-10), for the same reason as {@link hookFailedNotice}.
 * `started`/`installed`/`completed` stay quiet.
 */
export function pluginFailedNotice(message: PluginInstall): SessionEvent {
  const error = message.error ?? '';

  return notice({
    noticeId: message.uuid,
    kind: 'agent.info',
    level: 'warning',
    native: 'system:plugin_install',
    text: message.name === undefined ? error : `${message.name}: ${error}`,
    ...subagentOf(message),
  });
}

/** `agent.info` — the agent read memories (`memory_recall`). Folded from `memory.recalled` (D-10). */
export function memoryRecalledNotice(message: MemoryRecall): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'agent.info',
    level: 'info',
    native: 'system:memory_recall',
    messageKey: 'sessions.notice.memoryRecalled',
    params: { paths: message.memories.map((memory) => memory.path) },
    ...subagentOf(message),
  });
}

/** `agent.stopping` — the CLI's own process is about to exit (`worker_shutting_down`). */
export function agentStoppingNotice(message: WorkerShuttingDown): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'agent.stopping',
    level: 'notice',
    native: 'system:worker_shutting_down',
    messageKey: 'sessions.notice.agentStopping',
    params: { reason: message.reason },
    ...subagentOf(message),
  });
}

/** `compaction.failed` — a `/compact` ended without compacting (`status` with `compact_result: 'failed'`). */
export function compactionFailedNotice(message: StatusMessage): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'compaction.failed',
    level: 'warning',
    native: 'system:status',
    text: message.compact_error ?? '',
    ...subagentOf(message),
  });
}

/**
 * `auth.failed` — the CLI lost its authentication (`auth_status` with an `error`). Takes the error
 * already narrowed to a non-empty string: the caller (`fromAuthStatus`) only reaches this once it
 * has confirmed there is one, so there is no empty case left to default here.
 */
export function authFailedNotice(message: AuthStatus & { readonly error: string }): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'auth.failed',
    level: 'error',
    native: 'auth_status',
    text: message.error,
  });
}

/** `agent.info` — the agent started a new conversation (`conversation_reset`, `/clear`). Folded (D-10). */
export function conversationResetNotice(message: ConversationReset): SessionEvent {
  return notice({
    noticeId: message.uuid,
    kind: 'agent.info',
    level: 'notice',
    native: 'conversation_reset',
    messageKey: 'sessions.notice.conversationReset',
    params: { newConversationId: message.new_conversation_id },
  });
}

/**
 * `unknown` — a variant this build has never seen (B-13). `text` comes from a known top-level string
 * field only, and never from the JSON of the message (D-03): the same reason {@link describe} never
 * logs the payload applies to the replay buffer and to the screen.
 */
export function unknownNotice(
  raw: unknown,
  noticeId: string,
  native: string,
  at?: string,
): SessionEvent {
  const text = knownTextField(raw);

  return notice({
    noticeId,
    kind: 'unknown',
    level: 'notice',
    native,
    ...(text === undefined ? {} : { text }),
    ...(at === undefined ? {} : { at }),
  });
}

/** The first of a known set of top-level string fields an unknown message carries, if any (D-03). */
const KNOWN_TEXT_FIELDS = ['content', 'text', 'message', 'error', 'reason'] as const;

function knownTextField(raw: unknown): string | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }

  for (const field of KNOWN_TEXT_FIELDS) {
    const value = raw[field];
    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

/**
 * The subagent a notice belongs to, read dynamically rather than typed: none of the system messages
 * this file builds a notice from declare `parent_tool_use_id` in the SDK's own types today, so a strict
 * read would never compile. A future SDK that adds it to one of them is read without a change here.
 *
 * Every caller in this file passes one of its own typed system messages, always a plain object —
 * `Record<string, unknown>` is the parameter type for exactly that reason, not `unknown`.
 */
function subagentOf(message: Record<string, unknown>): { readonly parentToolUseId?: string } {
  const parent = message['parent_tool_use_id'];
  return typeof parent === 'string' && parent !== '' ? { parentToolUseId: parent } : {};
}
