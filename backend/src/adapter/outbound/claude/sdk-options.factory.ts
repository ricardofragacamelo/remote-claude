import type { Options } from '@anthropic-ai/claude-agent-sdk';

import { sdkPermissionMode } from '@domain/session';
import type { EffortLevel, PermissionMode } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';
import { flagSettings } from './flag-settings';

/** Limits the installation puts on a session. Numbers, from configuration — never from a client. */
export interface SessionLimits {
  /** Spend ceiling for one `query()` call, in US dollars. */
  readonly maxBudgetUsd: number;

  /** How many turns one session may run before the SDK stops it. */
  readonly maxTurns: number;
}

/** What the factory needs in order to describe a session to the SDK. */
export interface SdkOptionsInput {
  readonly workspace: WorkspacePath;
  readonly model: string | null;
  readonly permissionMode: PermissionMode;

  /**
   * The conversation: the id it has in Claude's store, and the one it continues, if any.
   *
   * Equal ids continue a conversation of ours in its file; different ids fork one begun elsewhere
   * into a new one of ours ([D-04](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
   */
  readonly conversation: { readonly claudeSessionId: string; readonly resumedFrom: string | null };

  /** How hard the model thinks, for the life of the session — absent for its default (D-16). */
  readonly effort?: EffortLevel | null;

  /** The output style a default chose (plan 13, B-15) — absent for the installation's. */
  readonly outputStyle?: string | null;

  /** Thinking switched off by a default — absent or `on` for the product's own (plan 13, B-15). */
  readonly thinking?: 'on' | 'off' | null;

  /** The model used when the main one is overloaded — never equal to it, the domain says. */
  readonly fallbackModel?: string | null;

  /**
   * Where a fork for an edit-and-resend starts (plan 08, D-19) — absent for any other session. The
   * conversation must be a fork: `resumedFrom` is the one sent again, `claudeSessionId` the new one.
   */
  readonly forkAt?: { readonly keepUpTo: string; readonly dropsTurn: string } | null;
  readonly limits: SessionLimits;
  readonly abortController: AbortController;

  /**
   * The subprocess's environment — the backend's own plus the mark that lets the next boot find it
   * if this backend dies without closing it (B-03). See `process-marker.ts`.
   */
  readonly environment: Readonly<Record<string, string | undefined>>;

  /** Where the CLI's `stderr` goes. It is read, not discarded — see below. */
  onStderr: (data: string) => void;
}

/**
 * The `Options` of a session, except the two the call site states itself.
 *
 * **`settingSources` and `hooks.PreToolUse` are deliberately not set here.** They are the two
 * settings whose absence turns a protection off in silence, so `pnpm scan:security` looks for them
 * in the arguments of the `query(` call — the one place a reviewer and a scanner both read. A
 * factory that set them would satisfy the type and hide them from both. They are written literally
 * in `session-runner.ts`, and this factory never overrides them. See
 * scripts/lib/agent-sdk-rules.mjs and docs/architecture/backend/04-claude-integration.md.
 *
 * Two more things this function does **not** do, and neither is an omission:
 *
 * - **it never sets `allowedTools`.** A bare tool name there auto-approves the tool before the
 *   callback is consulted; the SDK says so on `stderr` (`CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`) and a
 *   backend that does not read `stderr` sees nothing at all. Narrowing the set of tools is done
 *   with `disallowedTools`, which excuses nobody
 *   ([D-14](../../../../../docs/plans/01-live-session/decisions.md));
 * - **it never makes `allowDangerouslySkipPermissions` configurable.** It is `false`, written once,
 *   and a flag like that ends up switched on.
 */
export function buildSdkOptions(input: SdkOptionsInput): Options {
  return {
    // The workspace *is* `cwd`. It has already cleared the allowlist by the time it gets here.
    cwd: input.workspace.value,

    // Ours as the SDK knows it: Permitir tudo reaches it as `default`, so `canUseTool` keeps being
    // called and our rules keep answering (ADR-022).
    permissionMode: sdkPermissionMode(input.permissionMode),

    // Never `true`, and never read from configuration. It would switch off `canUseTool`, which is
    // the product.
    allowDangerouslySkipPermissions: false,

    // Without deltas the UI sits on "thinking…" for minutes at a time.
    includePartialMessages: true,

    // The hook events are how the audit trail and the file checkpoints reach us.
    includeHookEvents: true,

    // The JSONL is shared with the editor: it is what lets a phone continue what a desktop began.
    persistSession: true,

    // Thinking is shown, folded (plan 08, D-17), and by default it comes **omitted** — a block with
    // no text, measured. Summarised is what gives the panel something to show; adaptive is what the
    // CLI does anyway on a model that has it, and an older one takes the option too (discovery §10.7).
    // A default may switch it off: faster and cheaper, and nothing to show (plan 13, D-06).
    thinking:
      input.thinking === 'off' ? { type: 'disabled' } : { type: 'adaptive', display: 'summarized' },

    // A subagent's text and thinking, not only its tools, with `parent_tool_use_id` — what lets the
    // panel nest it under the tool that opened it (D-15). One that reads a file costs a handful of
    // messages, measured: the replay buffer is not at risk.
    forwardSubagentText: true,

    // The user's own `/rewind` in the editor. Our undo does not depend on it — `rewindFiles()`
    // overwrites manual edits in silence and takes no file filter, so the snapshot store is ours.
    enableFileCheckpointing: true,

    // Only the servers the backend composes, and none of them on the argv: with the strict flag the
    // CLI starts nothing of `.mcp.json`, of a plugin, of an agent's frontmatter nor a claude.ai
    // connector — measured — and the servers of the session reach it through `setMcpServers()`
    // right after the start, over the control channel (ADR-018, plan 13 · D-02).
    strictMcpConfig: true,
    mcpServers: {},

    // The flag layer, from its builder: the shell inline of skills and slash commands off — it runs
    // with no `canUseTool` and no `PreToolUse`, measured — and the output style when one was chosen.
    settings: flagSettings({ outputStyle: input.outputStyle ?? null }),

    maxBudgetUsd: input.limits.maxBudgetUsd,
    maxTurns: input.limits.maxTurns,
    abortController: input.abortController,
    // The task list (plan 08, D-25): since CLI 2.1.268 it is offered only to models up to Opus 4.7,
    // and this turns it on for every model. Which tool keeps it — `TodoWrite` or the `Task*` — is
    // `CLAUDE_CODE_ENABLE_TASKS`, left to the environment — absent, the current `Task*`; `0`, the
    // older `TodoWrite` (documented in `.env.example`). The panel reads both.
    env: { ...input.environment, CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' },

    // Read rather than dropped: it is the only channel on which the SDK reports that one of our
    // own options shadowed the permission callback.
    stderr: input.onStderr,

    ...(input.model === null ? {} : { model: input.model }),
    ...(input.effort == null ? {} : { effort: input.effort }),
    ...(input.fallbackModel == null ? {} : { fallbackModel: input.fallbackModel }),
    ...conversationOptions(input.conversation),
    ...forkOptions(input.forkAt),
  };
}

/**
 * Where a fork for an edit-and-resend starts: the conversation kept up to the entry before the
 * prompt, and that prompt's turn declared as the one dropped — so the CLI checks that nothing else
 * would be lost, and refuses deterministically when something would (D-19).
 */
function forkOptions(
  forkAt: SdkOptionsInput['forkAt'],
): Pick<Options, 'resumeDropsTurn' | 'resumeSessionAt'> {
  return forkAt == null
    ? {}
    : { resumeSessionAt: forkAt.keepUpTo, resumeDropsTurn: forkAt.dropsTurn };
}

/**
 * How the SDK is told which conversation this is — the three cases of
 * docs/architecture/backend/04-claude-integration.md#retomada--fork-fora-in-place-dentro.
 *
 * - **new** — `sessionId`, ours and recorded as ours before this call: it is what later tells this
 *   conversation from one the editor began;
 * - **ours, continued** — `resume` alone. The SDK refuses `sessionId` beside `resume` unless
 *   forking, and a conversation continued in place keeps the id it has;
 * - **begun elsewhere** — `resume` with `forkSession: true`, under a `sessionId` of ours. The file
 *   the editor may be using is never written: two writers in one JSONL fork the chain of
 *   `parentUuid`, and one side vanishes from every later read.
 */
function conversationOptions(
  conversation: SdkOptionsInput['conversation'],
): Pick<Options, 'forkSession' | 'resume' | 'sessionId'> {
  const { claudeSessionId, resumedFrom } = conversation;

  if (resumedFrom === null) {
    return { sessionId: claudeSessionId };
  }

  return resumedFrom === claudeSessionId
    ? { resume: resumedFrom }
    : { resume: resumedFrom, forkSession: true, sessionId: claudeSessionId };
}
