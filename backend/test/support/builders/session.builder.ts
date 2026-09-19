import { SessionRegistry } from '@application/session';
import type { ClaudeSessionHandle } from '@application/session';
import { UserId } from '@domain/auth';
import { Session, SessionId } from '@domain/session';
import type { PermissionMode } from '@domain/session';
import { WorkspacePath } from '@domain/workspace';

/** The id most session tests use. A real ULID, because the value object insists on one. */
export const SESSION_ID = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

/** A live session with sensible defaults, so a test states only what it cares about. */
export function aSession(
  overrides: {
    id?: string;
    ownerId?: string;
    workspace?: string;
    model?: string;
    permissionMode?: PermissionMode;
    openedAt?: Date;
  } = {},
): Session {
  return Session.open({
    id: SessionId.create(overrides.id ?? SESSION_ID),
    ownerId: UserId.create(overrides.ownerId ?? 'auth|owner'),
    workspace: WorkspacePath.create(overrides.workspace ?? '/srv/projects/app'),
    model: overrides.model ?? 'claude-sonnet-5',
    permissionMode: overrides.permissionMode ?? 'default',
    openedAt: overrides.openedAt ?? new Date('2026-09-18T12:00:00.000Z'),
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

  private settle(): Promise<void> {
    return this.failWith === null ? Promise.resolve() : Promise.reject(this.failWith);
  }
}

/** A registry holding the given sessions, each with a recording handle. */
export function aRegistry(
  sessions: readonly Session[] = [aSession()],
  limit = 10,
): { registry: SessionRegistry; handles: Map<string, RecordingHandle> } {
  const registry = new SessionRegistry(limit);
  const handles = new Map<string, RecordingHandle>();

  for (const session of sessions) {
    const handle = new RecordingHandle();
    handles.set(session.id.value, handle);
    registry.add({ session, handle });
  }

  return { registry, handles };
}
