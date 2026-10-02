import { SessionRegistry } from '@application/session';
import type { ClaudeSessionHandle, SessionConversation } from '@application/session';
import { UserId } from '@domain/auth';
import { Session, SessionId } from '@domain/session';
import type { PermissionMode, SessionClient, SlashCommand } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../fakes/fixed-clock';

/** The id most session tests use. A real ULID, because the value object insists on one. */
export const SESSION_ID = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

/** The conversation most session tests use: a UUID, because the SDK insists on one. */
export const CONVERSATION_ID = '6b41b192-a41b-46c2-b8d7-5098d8c825be';

/** A conversation of Claude — fresh unless it says what it continues. */
export function aConversation(
  claudeSessionId = CONVERSATION_ID,
  resumedFrom: string | null = null,
): SessionConversation {
  return {
    claudeSessionId: ClaudeSessionId.create(claudeSessionId),
    resumedFrom: resumedFrom === null ? null : ClaudeSessionId.create(resumedFrom),
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
    permissionMode: overrides.permissionMode ?? 'default',
    openedAt: overrides.openedAt ?? OPENED_AT,
    openedFrom: overrides.openedFrom ?? 'web',
  });
}

/** A handle that records what it was asked to do, instead of driving a subprocess. */
export class RecordingHandle implements ClaudeSessionHandle {
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

  prompt(text: string): void {
    this.prompts.push(text);
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
  };
}
