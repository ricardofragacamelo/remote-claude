import type {
  ContextUse,
  EffortLevel,
  InstallationModel,
  McpServer,
  PermissionMode,
  PromptExtras,
  SessionCloseReason,
  SessionId,
  SlashCommand,
} from '@domain/session';
import type { ClaudeSessionId } from '@domain/transcript';
import type { WorkspacePath } from '@domain/workspace';

/**
 * One event of our own contract, on its way out of the adapter.
 *
 * It is **not** an `SDKMessage`. The SDK's type has around 38 variants and the package is still on
 * `0.3.x`; emitting it raw would make every client a hostage of its next release
 * ([ADR-006](../../../../docs/architecture/shared/00-decisions.md)). The translation happens in
 * `adapter/outbound/claude/sdk-message.mapper.ts`, and nothing outside that folder ever sees the
 * SDK's shape.
 */
export interface SessionEvent {
  /** A `type` of the generated contract, such as `message.delta`. */
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Which conversation of Claude a live session is, and how it came to be.
 *
 * Our `SessionId` names the live session — a subprocess and a stream, gone when it ends. This names
 * the conversation in Claude's store, which outlives every session that ever continued it: it is
 * what the history reads, and what a client reloads from when the replay buffer has lost what it
 * missed.
 */
export interface SessionConversation {
  /**
   * The id the conversation has in Claude's store.
   *
   * Minted by us and recorded as ours **before** the subprocess exists, for a new conversation and
   * for a fork; the id it already had, for one of ours continued in place.
   */
  readonly claudeSessionId: ClaudeSessionId;

  /**
   * The conversation this session continues, or `null` for a fresh one.
   *
   * Equal to `claudeSessionId` when one of our own is continued in its file; different when one
   * begun elsewhere is forked — and then nothing is ever written into the original
   * ([D-04](../../../../docs/plans/04-transcript-and-resume/decisions.md)).
   */
  readonly resumedFrom: ClaudeSessionId | null;
}

/** Everything the adapter needs in order to open a session. */
export interface ClaudeSessionStart {
  readonly sessionId: SessionId;
  readonly workspace: WorkspacePath;

  /** Model to open with, or `null` for whatever the installation defaults to. */
  readonly model: string | null;

  readonly permissionMode: PermissionMode;

  /** Which conversation of Claude this session is — new, continued in place, or forked. */
  readonly conversation: SessionConversation;

  /** How hard the model thinks, chosen when the session opens — `null` for its default (D-16). */
  readonly effort?: EffortLevel | null;

  /**
   * Where a fork for an edit-and-resend starts (plan 08, D-19): the conversation is kept up to and
   * including `keepUpTo`, and the turn of the prompt `dropsTurn` is the one discarded — or `null`.
   */
  readonly forkAt?: { readonly keepUpTo: string; readonly dropsTurn: string } | null;

  /** Called for every event the stream produced, in order. */
  onEvent(event: SessionEvent): void;

  /** Called once, when the stream ends — for any reason, including a crash. */
  onClosed(reason: SessionCloseReason): void;

  /**
   * The CLI refused the point a fork for an edit-and-resend starts from — deterministically, so it
   * is never tried again (plan 08, D-19, S-164).
   */
  onForkRejected?(): void;
}

/**
 * A session that is running, as the application drives it.
 *
 * Every method is a control request, and control requests only exist because the prompt is a
 * streaming input rather than a string — see
 * docs/architecture/backend/04-claude-integration.md#streaming-input-mode--obrigatório.
 */
export interface ClaudeSessionHandle {
  /**
   * Queues a turn.
   *
   * It does not wait: a prompt that arrives while a turn is running is **queued** and runs next,
   * which is what the SDK already does and what the Claude Code UI does. Refusing it with a
   * conflict was our own policy and it was the wrong one.
   *
   * @param text what Claude reads — composed already, mentions guarded (plan 08, B-44)
   * @param extras the images that go beside it, and what the log may say of its context — never the
   *   content (S-204)
   * @returns the id of the message, the one the conversation keeps it under — what an edit-and-resend
   *   forks from (plan 08, D-19)
   */
  prompt(text: string, extras?: PromptExtras): string;

  interrupt(): Promise<void>;
  setModel(model: string): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;

  /**
   * The version of the CLI this session spawned, as the CLI itself reported it, or `null` until it
   * has.
   *
   * The version of the binary **the SDK spawns**, and never the one on `PATH`: a machine with the
   * terminal's CLI and the editor's in different versions is the ordinary case, and a menu cached
   * by the wrong one is the menu of another installation
   * ([D-05](../../../../docs/plans/04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira)).
   */
  readonly cliVersion: string | null;

  /**
   * The slash commands the installation offers this session — `supportedCommands()`, which costs
   * no quota: nothing is said to the model.
   *
   * The whole list, the dead and the internal included; what the menu hides is the domain's call.
   *
   * @throws {import('@domain/session').ClaudeUnavailableError} the CLI failed to answer
   * @throws {import('@domain/session').ClaudeTimeoutError} the CLI did not answer in time
   */
  supportedCommands(): Promise<readonly SlashCommand[]>;

  /** The installation's models — `supportedModels()`; no quota. @throws as {@link supportedCommands} */
  supportedModels(): Promise<readonly InstallationModel[]>;

  /** The use of the context window by category — `getContextUsage()`. @throws as {@link supportedCommands} */
  contextUse(): Promise<ContextUse>;

  /** The MCP servers, reduced — `mcpServerStatus()`. @throws as {@link supportedCommands} */
  mcpServers(): Promise<readonly McpServer[]>;

  /**
   * Ends the session and releases its subprocess.
   *
   * Idempotent, because it runs from a command, from a `finally` and from the shutdown hook, and
   * any two of those can happen at once. A leaked subprocess does not die on its own, and this one
   * runs on the machine of whoever installed the product.
   */
  close(): Promise<void>;
}

/** How a session of Claude is opened. The only door to the Agent SDK. */
export interface ClaudeSessionPort {
  start(input: ClaudeSessionStart): Promise<ClaudeSessionHandle>;
}

export const CLAUDE_SESSION_PORT = Symbol('ClaudeSessionPort');
