import type {
  CommandMenu,
  ContextUse,
  EffortLevel,
  InstallationModel,
  McpServer,
  SessionInitialization,
  PermissionMode,
  PromptExtras,
  SessionCloseReason,
  SessionId,
  SlashCommand,
} from '@domain/session';
import { EngineCapabilityUnavailableError } from '@domain/engine';
import type {
  ConversationRef,
  EngineCapabilities,
  EngineDescription,
  EngineId,
} from '@domain/engine';
import type { McpServerConfig, McpServerSetOutcome } from '@domain/mcp';
import type { WorkspacePath } from '@domain/workspace';
import type { EventPayloads } from '@remote-claude/contracts';
import type { EngineSecurityContract } from './engine-security.port';

/**
 * One event of our own contract, on its way out of the adapter of an engine.
 *
 * It is **not** the engine's own message: emitting that raw would make every client a hostage of the
 * engine's next release ([ADR-006](../../../../docs/architecture/shared/00-decisions.md)), and would
 * teach every client the engine. The translation happens in the engine's adapter, and nothing
 * outside it ever sees the engine's shape (ADR-025). The union of the contract's events, so the
 * compiler says when an event is not one of them, or its payload is not the one declared (S-29).
 */
export type SessionEvent = {
  readonly [K in keyof EventPayloads]: {
    /** A `type` of the generated contract, such as `message.delta`. */
    readonly type: K;
    readonly payload: EventPayloads[K];
  };
}[keyof EventPayloads];

/**
 * Which conversation a live session is, and how it came to be.
 *
 * Our `SessionId` names the live session — a subprocess and a stream, gone when it ends. This names
 * the conversation in the agent's own store, which outlives every session that ever continued it: it
 * is what the history reads, and what a client reloads from when the replay buffer has lost what it
 * missed.
 */
export interface SessionConversation {
  /**
   * The conversation, `{ engine, id }`.
   *
   * Minted by the engine and recorded as ours **before** the subprocess exists, for a new
   * conversation and for a fork; the one it already was, for one of ours continued in place.
   */
  readonly ref: ConversationRef;

  /**
   * The conversation this session continues, or `null` for a fresh one.
   *
   * Equal to `ref` when one of our own is continued in its file; different when one begun elsewhere
   * is forked — and then nothing is ever written into the original
   * ([D-04](../../../../docs/plans/04-transcript-and-resume/decisions.md)).
   */
  readonly resumedFrom: ConversationRef | null;
}

/**
 * The payload of [event] as a plain record — what a transport that does not read the contract
 * (the hub that numbers and sends, the history that pages) carries.
 */
export function payloadRecord(event: SessionEvent): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(event.payload));
}

/** Everything the adapter of an engine needs in order to open a session. */
export interface AgentSessionStart {
  readonly sessionId: SessionId;
  readonly workspace: WorkspacePath;

  /** Model to open with, or `null` for whatever the installation defaults to. */
  readonly model: string | null;

  readonly permissionMode: PermissionMode;

  /** Which conversation this session is — new, continued in place, or forked. */
  readonly conversation: SessionConversation;

  /** How hard the model thinks, chosen when the session opens — `null` for its default (D-16). */
  readonly effort?: EffortLevel | null;

  /** Whether the model thinks before answering — `null` for the product's own (plan 13, B-15). */
  readonly thinking?: 'on' | 'off' | null;

  /** The output style a default chose — `null` for the installation's. */
  readonly outputStyle?: string | null;

  /** The model used when the main one is overloaded — `null` for none. */
  readonly fallbackModel?: string | null;

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
   * The engine refused the point a fork for an edit-and-resend starts from — deterministically, so
   * it is never tried again (plan 08, D-19, S-164).
   */
  onForkRejected?(): void;
}

/**
 * What a session can be asked beyond its core, each only when its engine has the capability
 * (ADR-025): a member that is absent is a capability the engine does not have, and asking for it is
 * `ENGINE_CAPABILITY_UNAVAILABLE` — see {@link controlOf}. None of them spends quota.
 */
export interface EngineControl {
  /** Switches the model while the session lives (`modelSwitch`). */
  setModel?(model: string): Promise<void>;

  /**
   * The commands the installation offers this session (`slashCommands`) — the whole list, the dead
   * and the internal included; what the menu hides is the domain's call.
   *
   * @throws {import('@domain/engine').AgentUnavailableError} the engine failed to answer
   * @throws {import('@domain/engine').AgentTimeoutError} the engine did not answer in time
   */
  supportedCommands?(): Promise<readonly SlashCommand[]>;

  /** The installation's models. @throws as {@link supportedCommands} */
  supportedModels?(): Promise<readonly InstallationModel[]>;

  /** The use of the context window by category (`contextUse`). @throws as {@link supportedCommands} */
  contextUse?(): Promise<ContextUse>;

  /** The MCP servers, reduced (`mcp`). @throws as {@link supportedCommands} */
  mcpServers?(): Promise<readonly McpServer[]>;

  /**
   * Replaces the dynamically-added MCP servers of this session (`mcp`, plan 13, B-21) — secrets
   * included, and never through the engine's own argv (D-02): this is the one path a server's
   * configuration takes into a running session, called once right after it starts, with whatever
   * the core composed from the store. @throws as {@link supportedCommands}
   */
  setMcpServers?(servers: readonly McpServerConfig[]): Promise<McpServerSetOutcome>;

  /** Turns one of this session's MCP servers on or off, by name (`mcp`, B-22). @throws as {@link supportedCommands} */
  toggleMcpServer?(name: string, enabled: boolean): Promise<void>;

  /** Reconnects one of this session's MCP servers, by name (`mcp`, B-22). @throws as {@link supportedCommands} */
  reconnectMcpServer?(name: string): Promise<void>;

  /**
   * What the installation says about itself in one question: commands, agents, models and the
   * account — and whatever more the engine says, which its extension reads (plan 13, D-05).
   * @throws as {@link supportedCommands}
   */
  initialization?(): Promise<SessionInitialization>;

  /**
   * The prompt that compacts the conversation in this engine, sent through the queue like any
   * prompt (plan 28, B-23). Absent on an engine that cannot compact — with no `compaction` capability.
   */
  readonly compactionPrompt?: string;
}

/**
 * A session that is running, as the application drives it — the core every engine has, and its
 * {@link EngineControl}.
 */
export interface AgentSessionHandle {
  /** What this session can do — per session, not only per engine (ADR-025). */
  readonly capabilities: EngineCapabilities;

  /**
   * Queues a turn.
   *
   * It does not wait: a prompt that arrives while a turn is running is **queued** and runs next.
   *
   * @param text what the agent reads — composed already, mentions guarded (plan 08, B-44)
   * @param extras the images that go beside it, and what the log may say of its context — never the
   *   content (S-204)
   * @returns the id of the message, the one the conversation keeps it under — what an edit-and-resend
   *   forks from (plan 08, D-19)
   */
  prompt(text: string, extras?: PromptExtras): string;

  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;

  /**
   * The version of the binary this session spawned, as it reported itself, or `null` until it has —
   * never the one on `PATH`
   * ([D-05](../../../../docs/plans/04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira)).
   */
  readonly cliVersion: string | null;

  /** What the session can be asked beyond its core. */
  readonly control: EngineControl;

  /**
   * Ends the session and releases its subprocess.
   *
   * Idempotent, because it runs from a command, from a `finally` and from the shutdown hook, and any
   * two of those can happen at once. A leaked subprocess does not die on its own.
   */
  close(): Promise<void>;
}

/** Why a part of an engine's installation has no version: nothing is there, or it is not legible. */
export type ComponentUnread = 'notInstalled' | 'unreadable';

/** A part of an engine's installation: its version, or why there is none — exactly one is set. */
export interface ComponentReading {
  readonly version: string | null;
  readonly reason: ComponentUnread | null;
}

/**
 * What an engine says of itself, and the parts of its installation the "About" screen lists — read
 * once, without spawning anything (plan 06, S-68; plan 28, B-34).
 */
export interface EngineSelfDescription extends EngineDescription {
  readonly components: {
    /** The binary the adapter drives. */
    readonly binary: ComponentReading;
    /** The library the adapter drives it through — `null` for an engine driven with none. */
    readonly library: ComponentReading | null;
  };
}

/**
 * One coding agent, as the core drives it (ADR-025): it describes itself, names its conversations
 * and opens sessions. The adapter of each engine implements it, and the composition registers it.
 */
export interface AgentEnginePort {
  readonly engine: EngineId;

  /** What a session of this engine can do — the same as `describe()` says, known without asking. */
  readonly capabilities: EngineCapabilities;

  /** How this adapter keeps the security contract of every engine (plan 28, B-35). */
  readonly security: EngineSecurityContract;

  /**
   * How the engine's menu of commands is ordered and badged (plan 28, B-37) — absent for an engine
   * that says nothing of it: nothing first, every namespace the project's.
   */
  readonly commandMenu?: CommandMenu | undefined;

  /** Installed? Which version? Logged in? What can it do? No quota spent, no credential exposed. */
  describe(): Promise<EngineSelfDescription>;

  /** Mints the id of a new conversation, in the engine's own form, before anything is spawned. */
  newConversation(): ConversationRef;

  /**
   * The conversation [id] names, or `null` when it is not an id this engine hands out — the engine's
   * own rule, asked before the engine is.
   */
  conversationOf(id: string): ConversationRef | null;

  start(input: AgentSessionStart): Promise<AgentSessionHandle>;
}

/** The controls that are calls — every member but the compaction prompt, which is a value. */
export type ControlMethod = Exclude<keyof EngineControl, 'compactionPrompt'>;

/**
 * The member of [handle]'s control named [name], or the refusal of an engine that does not have it
 * (ADR-025) — never an `undefined` that leaks.
 *
 * @throws {EngineCapabilityUnavailableError}
 */
export function controlOf<K extends ControlMethod>(
  engine: EngineId,
  handle: AgentSessionHandle,
  name: K,
): NonNullable<EngineControl[K]> {
  const member = handle.control[name];
  if (member === undefined) {
    throw new EngineCapabilityUnavailableError(engine.value, name);
  }
  return member.bind(handle.control) as NonNullable<EngineControl[K]>;
}
