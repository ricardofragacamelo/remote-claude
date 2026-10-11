import { payloadRecord, SessionRegistry } from '@application/session';
import type {
  AgentSessionHandle,
  AgentSessionStart,
  EngineControl,
  SessionConversation,
  SessionEvent,
} from '@application/session';
import type { EngineCapabilities } from '@domain/engine';
import { UserId } from '@domain/auth';
import { Session, SessionId } from '@domain/session';
import type {
  ContextUse,
  InstallationModel,
  McpServer,
  PermissionMode,
  PromptExtras,
  SessionClient,
  SessionInitialization,
  SlashCommand,
} from '@domain/session';
import { ConversationRef } from '@domain/engine';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../fakes/fixed-clock';

/** The id most session tests use. A real ULID, because the value object insists on one. */
export const SESSION_ID = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

/** The conversation most session tests use: a UUID, because the SDK insists on one. */
export const CONVERSATION_ID = '6b41b192-a41b-46c2-b8d7-5098d8c825be';

/** A conversation of Claude — fresh unless it says what it continues. */
export function aConversation(
  conversation = CONVERSATION_ID,
  resumedFrom: string | null = null,
): SessionConversation {
  return {
    ref: ConversationRef.create('claude', conversation),
    resumedFrom: resumedFrom === null ? null : ConversationRef.create('claude', resumedFrom),
  };
}

/** What an engine is handed to open a session — the defaults of {@link aSession}, callbacks inert. */
export function aStart(): AgentSessionStart {
  return {
    sessionId: SessionId.create(SESSION_ID),
    workspace: WorkspacePath.create('/srv/projects/app'),
    model: null,
    permissionMode: 'ask',
    conversation: aConversation(),
    onEvent: () => undefined,
    onClosed: () => undefined,
  };
}

/** A live session with sensible defaults, so a test states only what it cares about. */
export function aSession(
  overrides: {
    id?: string;
    ownerId?: string;
    workspace?: string;
    model?: string;
    permissionMode?: PermissionMode;
    openedAt?: Date;
    openedFrom?: SessionClient;
  } = {},
): Session {
  return Session.open({
    id: SessionId.create(overrides.id ?? SESSION_ID),
    ownerId: UserId.create(overrides.ownerId ?? 'auth|owner'),
    workspace: WorkspacePath.create(overrides.workspace ?? '/srv/projects/app'),
    model: overrides.model ?? 'claude-sonnet-5',
    permissionMode: overrides.permissionMode ?? 'ask',
    openedAt: overrides.openedAt ?? OPENED_AT,
    openedFrom: overrides.openedFrom ?? 'web',
  });
}

/** Every capability a session can have — what a session of the product had before ADR-025. */
export const ALL_CAPABILITIES: EngineCapabilities = {
  resume: true,
  fork: 'atMessage',
  history: true,
  images: true,
  promptWhileBusy: true,
  questions: true,
  planApproval: true,
  taskList: true,
  subagents: true,
  thinking: true,
  slashCommands: true,
  modelSwitch: true,
  effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  contextUse: true,
  mcp: true,
  compaction: true,
  cost: 'usd',
  permissionModes: ['ask', 'acceptEdits', 'readOnly', 'allowAll'],
};

/** A handle that records what it was asked to do, instead of driving a subprocess. */
export class RecordingHandle implements AgentSessionHandle, EngineControl {
  /** What the engine can do — every capability, unless a test takes one away. */
  capabilities: EngineCapabilities = ALL_CAPABILITIES;

  /** The engine's own prompt to compact the conversation — what Claude Code's adapter has. */
  compactionPrompt?: string = '/compact';

  /** Every control: the handle answers them all itself, like the adapter of the product. */
  get control(): EngineControl {
    return this;
  }

  readonly prompts: string[] = [];
  readonly models: string[] = [];
  readonly modes: PermissionMode[] = [];
  interrupts = 0;
  closes = 0;

  /** When set, every control request rejects with it — the subprocess having died, say. */
  failWith: Error | null = null;

  /** What `cliVersion` answers. `null` is a CLI that has not said yet. */
  cliVersion: string | null = null;

  /** What `supportedCommands()` answers, and how many times it was asked. */
  commands: SlashCommand[] = [];
  commandCalls = 0;

  /** Held until released, so a test can put two asks in flight at once. */
  commandsHeld: Promise<void> | null = null;

  /** When set, `supportedCommands()` rejects with it. */
  commandsFailWith: Error | null = null;

  /** What went beside each prompt — `undefined` for one without context (plan 08, B-44). */
  readonly extras: (PromptExtras | undefined)[] = [];

  prompt(text: string, extras?: PromptExtras): string {
    this.prompts.push(text);
    this.extras.push(extras);
    return `prompt-${String(this.prompts.length)}`;
  }

  interrupt(): Promise<void> {
    this.interrupts += 1;
    return this.settle();
  }

  setModel(model: string): Promise<void> {
    this.models.push(model);
    return this.settle();
  }

  setPermissionMode(mode: PermissionMode): Promise<void> {
    this.modes.push(mode);
    return this.settle();
  }

  close(): Promise<void> {
    this.closes += 1;
    return this.settle();
  }

  async supportedCommands(): Promise<readonly SlashCommand[]> {
    this.commandCalls += 1;
    await this.commandsHeld;

    if (this.commandsFailWith !== null) {
      throw this.commandsFailWith;
    }

    return this.commands;
  }

  /** What `supportedModels()` answers, and how many times it was asked. */
  offered: InstallationModel[] = [];
  modelCalls = 0;

  /** Held until released, so a test can put two asks for the models in flight at once. */
  modelsHeld: Promise<void> | null = null;

  /** What `contextUse()` and `mcpServers()` answer. */
  context: ContextUse = {
    model: 'claude-sonnet-5',
    totalTokens: 1_000,
    maxTokens: 200_000,
    percentage: 1,
    categories: [],
  };
  servers: McpServer[] = [];

  /** When set, the three questions about the installation reject with it. */
  insightFailWith: Error | null = null;

  async supportedModels(): Promise<readonly InstallationModel[]> {
    this.modelCalls += 1;
    await this.modelsHeld;
    return this.answer(this.offered);
  }

  contextUse(): Promise<ContextUse> {
    return this.answer(this.context);
  }

  mcpServers(): Promise<readonly McpServer[]> {
    return this.answer(this.servers);
  }

  /** The account and the output styles `initialization()` answers beside the lists above. */
  account: SessionInitialization['account'] = {
    email: 'person@example.com',
    organization: null,
    plan: 'max',
    provider: 'firstParty',
    tokenSource: null,
    apiKeySource: null,
  };
  outputStyles: string[] = ['default'];
  initializationCalls = 0;

  initialization(): Promise<SessionInitialization> {
    this.initializationCalls += 1;
    return this.answer({
      commands: this.commands,
      agents: [],
      models: this.offered,
      outputStyle: 'default',
      outputStyles: this.outputStyles,
      account: this.account,
    });
  }

  private answer<T>(value: T): Promise<T> {
    return this.insightFailWith === null
      ? Promise.resolve(value)
      : Promise.reject(this.insightFailWith);
  }

  private settle(): Promise<void> {
    return this.failWith === null ? Promise.resolve() : Promise.reject(this.failWith);
  }
}

/** The instant sessions open at by default, and the clock a registry starts on. */
export const OPENED_AT = new Date('2026-09-18T12:00:00.000Z');

/** A clock standing at {@link OPENED_AT}, for a registry that has to notice activity. */
export function aClock(): FixedClock {
  return new FixedClock(OPENED_AT);
}

/** A registry holding the given sessions, each with a recording handle. */
export function aRegistry(
  sessions: readonly Session[] = [aSession()],
  limit = 10,
  clock: FixedClock = aClock(),
): { registry: SessionRegistry; handles: Map<string, RecordingHandle> } {
  const registry = new SessionRegistry(limit, clock);
  const handles = new Map<string, RecordingHandle>();

  for (const session of sessions) {
    const handle = new RecordingHandle();
    handles.set(session.id.value, handle);
    registry.add({ session, handle, conversation: aConversation() });
  }

  return { registry, handles };
}

/** A command of the installation, as `supportedCommands()` would list it. */
export function aCommand(name: string, overrides: Partial<SlashCommand> = {}): SlashCommand {
  return {
    name,
    description: overrides.description ?? `the ${name} command`,
    argumentHint: overrides.argumentHint ?? '',
    aliases: overrides.aliases ?? [],
    ...(overrides.builtin === undefined ? {} : { builtin: overrides.builtin }),
  };
}

/**
 * The payload of [event] as a plain record, for a test that reads one field — `{}` for no event.
 * The contract types each payload; a test reading the field of an event it found by `type` is the
 * place to read it untyped.
 */
export function payloadOf(event: SessionEvent | undefined): Readonly<Record<string, unknown>> {
  return event === undefined ? {} : payloadRecord(event);
}

/**
 * An event as a test writes it: a `type` and only the fields the test is about — what a fake engine
 * emits to drive a use case, whatever the full payload of that `type` is.
 */
export function anEvent(type: string, payload: Record<string, unknown> = {}): SessionEvent {
  return { type, payload } as unknown as SessionEvent;
}

/** [events] as plain records, for a test that reads them by field. */
export function asRecords(
  events: readonly SessionEvent[],
): { type: string; payload: Record<string, unknown> }[] {
  return events.map((event) => ({ type: event.type, payload: { ...payloadRecord(event) } }));
}
