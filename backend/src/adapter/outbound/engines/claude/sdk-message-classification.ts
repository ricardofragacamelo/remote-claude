/**
 * Every variant of the SDK's `SDKMessage`, plus `command_lifecycle` (which the CLI emits outside the
 * typed union), in exactly one of three lists — never two, never none (plan 27, B-08, discovery
 * [§3](../../../../../docs/discovery/09-perdas-do-backend-na-conversa.md#3-princípios), princípio 1).
 *
 * This file is **documentation the compiler can check**, not the mapping itself: the behaviour lives
 * in `sdk-message.mapper.ts`'s `switch`, which a type-level test
 * (`sdk-message.mapper.classification.spec.ts`) keeps honest against the SDK's own union. This list is
 * what a unit test walks to prove the count, the motive and the absence of a variant in two lists at
 * once (S-18, S-20, S-21) — reading it is the fastest way to answer "where does X go, and why".
 *
 * `user` and `user:replay` are **one** discriminant at runtime (`type: 'user'`, told apart by
 * `isReplay`), named apart here only because the SDK's own union counts `SDKUserMessage` and
 * `SDKUserMessageReplay` as two of its "39 variants" — the mapper's `switch` has one `case 'user'` for
 * both.
 */

export type SdkVariantList = 'mapped' | 'warning' | 'quiet';

export interface SdkVariantClassification {
  /** `type`, or `type:subtype` for the `system` family — exactly as the mapper's `switch` reads it. */
  readonly variant: string;
  /** **mapped** → a contract event of its own; **warning** → a `session.notice`, maybe conditional; **quiet** → neither. */
  readonly list: SdkVariantList;
  readonly reason: string;
}

export const SDK_VARIANT_CLASSIFICATION: readonly SdkVariantClassification[] = [
  // Mapped — a contract event of its own.
  {
    variant: 'assistant',
    list: 'mapped',
    reason: 'the answer and every tool it opens — message.completed, tool.started',
  },
  {
    variant: 'user',
    list: 'mapped',
    reason: 'a prompt or a tool result — message.completed, tool.completed',
  },
  {
    variant: 'user:replay',
    list: 'mapped',
    reason:
      'the same as `user`: a prompt echoed from another device, or a synthetic injection (B-11)',
  },
  {
    variant: 'stream_event',
    list: 'mapped',
    reason: 'a streamed fragment of the answer — message.delta',
  },
  {
    variant: 'tool_progress',
    list: 'mapped',
    reason: 'a running tool, still at it — tool.progress',
  },
  {
    variant: 'result',
    list: 'mapped',
    reason: 'the turn ended — turn.completed, with a turn.failed notice alongside on error (B-10)',
  },
  {
    variant: 'system:compact_boundary',
    list: 'mapped',
    reason: 'the conversation was compacted — session.compacted',
  },
  {
    variant: 'system:commands_changed',
    list: 'mapped',
    reason: 'the slash-command menu changed mid-session — session.commandsChanged',
  },
  {
    variant: 'system:api_retry',
    list: 'mapped',
    reason:
      'session.statusChanged stays `thinking`, with a request.retrying notice alongside (B-09)',
  },
  {
    variant: 'system:permission_denied',
    list: 'mapped',
    reason:
      "the CLI denied a tool before it ran — the matching tool.completed closes `status: 'denied'` with the reason (B-10), never its own notice",
  },

  // Warning — a session.notice, some of them only in part of their states.
  {
    variant: 'rate_limit_event',
    list: 'warning',
    reason: "usage.limited, but only when the state is not the normal 'allowed' one",
  },
  {
    variant: 'system:model_refusal_fallback',
    list: 'warning',
    reason:
      'model.switched — never a message.retracted: the uuids were not confirmed to match (D-06)',
  },
  {
    variant: 'system:model_refusal_no_fallback',
    list: 'warning',
    reason: 'model.refused, with the refused content',
  },
  {
    variant: 'system:local_command_output',
    list: 'warning',
    reason: "command.output — a local slash command's own output",
  },
  {
    variant: 'system:informational',
    list: 'warning',
    reason:
      "agent.info — the CLI's generic banner, and where a hook's own systemMessage arrives (measured, B-01)",
  },
  {
    variant: 'system:hook_response',
    list: 'warning',
    reason: "agent.info, but only when outcome is 'error'; 'success'/'cancelled' are quiet",
  },
  {
    variant: 'system:plugin_install',
    list: 'warning',
    reason: "agent.info, but only when status is 'failed'; every other status is quiet",
  },
  {
    variant: 'system:memory_recall',
    list: 'warning',
    reason: 'agent.info, with the paths the agent read',
  },
  {
    variant: 'system:worker_shutting_down',
    list: 'warning',
    reason: 'agent.stopping — the CLI process is about to exit',
  },
  {
    variant: 'system:notification',
    list: 'warning',
    reason: "agent.notification — the CLI's own REPL notification queue",
  },
  {
    variant: 'system:status',
    list: 'warning',
    reason: "compaction.failed, but only when compact_result is 'failed'; the rest is quiet",
  },
  {
    variant: 'auth_status',
    list: 'warning',
    reason: 'auth.failed, but only when it carries an error; the rest is quiet',
  },
  {
    variant: 'conversation_reset',
    list: 'warning',
    reason: 'agent.info — the agent started a new conversation (`/clear`)',
  },

  // Quiet — nothing for the timeline, and never `unknown`.
  {
    variant: 'system:init',
    list: 'quiet',
    reason: 'our own session.started already says this, with our id and our workspace',
  },
  {
    variant: 'system:control_request_progress',
    list: 'quiet',
    reason:
      'progress of our own control request (a toggle, a reconnect) — askControl already times it',
  },
  {
    variant: 'system:hook_started',
    list: 'quiet',
    reason: 'lifecycle only — the result is what matters',
  },
  {
    variant: 'system:hook_progress',
    list: 'quiet',
    reason: 'lifecycle only — the result is what matters',
  },
  {
    variant: 'system:task_notification',
    list: 'quiet',
    reason: "a subagent's own messages and tools draw it — nothing here for the main timeline",
  },
  {
    variant: 'system:task_started',
    list: 'quiet',
    reason: "a subagent's own messages and tools draw it — nothing here for the main timeline",
  },
  {
    variant: 'system:task_updated',
    list: 'quiet',
    reason: "a subagent's own messages and tools draw it — nothing here for the main timeline",
  },
  {
    variant: 'system:task_progress',
    list: 'quiet',
    reason: "a subagent's own messages and tools draw it — nothing here for the main timeline",
  },
  {
    variant: 'system:thinking_tokens',
    list: 'quiet',
    reason: 'a running counter, nothing for the timeline',
  },
  {
    variant: 'system:session_state_changed',
    list: 'quiet',
    reason: 'our own session status is already published',
  },
  {
    variant: 'system:background_tasks_changed',
    list: 'quiet',
    reason: "a subagent's own messages and tools draw it — nothing here for the main timeline",
  },
  {
    variant: 'system:files_persisted',
    list: 'quiet',
    reason: 'the Files API is not used (discovery §11)',
  },
  {
    variant: 'system:elicitation_complete',
    list: 'quiet',
    reason: 'MCP elicitation is not supported (discovery §11)',
  },
  {
    variant: 'system:mirror_error',
    list: 'quiet',
    reason:
      'a mirrored SessionStore batch failed — not used by this product, so nothing to tell a client',
  },
  {
    variant: 'prompt_suggestion',
    list: 'quiet',
    reason: 'the predicted-next-prompt feature is not wired (discovery §11)',
  },
  {
    variant: 'tool_use_summary',
    list: 'quiet',
    reason: "a label for a group of tools — the tool's own label is already ours (plan 26)",
  },
  {
    variant: 'command_lifecycle',
    list: 'quiet',
    reason: 'the prompt queue is already ours (plan 08, D-14) — not a member of SDKMessage itself',
  },
];
