import type { Options } from '@anthropic-ai/claude-agent-sdk';

import type { PermissionMode } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';

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
  readonly resumeSessionId: string | null;

  /** The id the new conversation takes in Claude's store, already recorded as ours. */
  readonly claudeSessionId: string | null;
  readonly limits: SessionLimits;
  readonly abortController: AbortController;

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

    permissionMode: input.permissionMode,

    // Never `true`, and never read from configuration. It would switch off `canUseTool`, which is
    // the product.
    allowDangerouslySkipPermissions: false,

    // Without deltas the UI sits on "thinking…" for minutes at a time.
    includePartialMessages: true,

    // The hook events are how the audit trail and the file checkpoints reach us.
    includeHookEvents: true,

    // The JSONL is shared with the editor: it is what lets a phone continue what a desktop began.
    persistSession: true,

    // The user's own `/rewind` in the editor. Our undo does not depend on it — `rewindFiles()`
    // overwrites manual edits in silence and takes no file filter, so the snapshot store is ours.
    enableFileCheckpointing: true,

    maxBudgetUsd: input.limits.maxBudgetUsd,
    maxTurns: input.limits.maxTurns,
    abortController: input.abortController,

    // Read rather than dropped: it is the only channel on which the SDK reports that one of our
    // own options shadowed the permission callback.
    stderr: input.onStderr,

    ...(input.model === null ? {} : { model: input.model }),
    ...(input.resumeSessionId === null ? {} : { resume: input.resumeSessionId }),

    // Ours, and recorded as ours before this call: it is what later tells this conversation from
    // one the editor began. The SDK refuses it beside `resume` unless forking, and a resume keeps
    // the id it has — so it is only ever set on a conversation that starts here.
    ...(input.claudeSessionId === null || input.resumeSessionId !== null
      ? {}
      : { sessionId: input.claudeSessionId }),
  };
}
