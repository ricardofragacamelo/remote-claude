import type { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import type { PermissionMode } from '@domain/session';
import type { SessionBroadcaster } from './ports/session-broadcaster.port';
import type { SessionRegistry } from './session-registry';

/**
 * The commands that drive a session that is already running.
 *
 * They are one file and several classes because they are the same three lines each — find the
 * session, check it is this user's, forward one control request — and splitting that into six
 * files would multiply the ceremony without separating anything. What each one owns is in its
 * own doc comment; the shared part is the base below, which is what stops the ownership check
 * from being written six times and forgotten once.
 */
abstract class SessionCommandUseCase {
  constructor(protected readonly registry: SessionRegistry) {}

  /**
   * The live session, if this caller may act on it.
   *
   * @throws {import('@domain/session').InvalidSessionIdError} when the id is not a ULID
   * @throws {import('@domain/session').SessionNotFoundError} unknown, closed, or somebody else's
   */
  protected require(rawSessionId: string, userId: UserId) {
    return this.registry.require(SessionId.create(rawSessionId), userId);
  }
}

/**
 * Sends one turn.
 *
 * A prompt that arrives while a turn is running is **queued** and runs next — the SDK does that
 * natively, it was measured, and it is what the Claude Code UI does. Refusing it with a `409` was
 * our own policy and it was the wrong one
 * ([R-02](../../../../docs/plans/00-bootstrap/progress.md)).
 */
export class PromptSessionUseCase extends SessionCommandUseCase {
  execute(rawSessionId: string, text: string, userId: UserId): void {
    this.require(rawSessionId, userId).handle.prompt(text);
  }
}

/** Interrupts the running turn. Any connection watching the session may ask for it. */
export class InterruptSessionUseCase extends SessionCommandUseCase {
  async execute(rawSessionId: string, userId: UserId): Promise<void> {
    await this.require(rawSessionId, userId).handle.interrupt();
  }
}

/** Changes the model of a running session. */
export class SetSessionModelUseCase extends SessionCommandUseCase {
  async execute(rawSessionId: string, model: string, userId: UserId): Promise<void> {
    const { session, handle } = this.require(rawSessionId, userId);

    await handle.setModel(model);
    session.setModel(model);
  }
}

/** Changes the permission mode of a running session. */
export class SetSessionPermissionModeUseCase extends SessionCommandUseCase {
  async execute(rawSessionId: string, mode: PermissionMode, userId: UserId): Promise<void> {
    const { session, handle } = this.require(rawSessionId, userId);

    await handle.setPermissionMode(mode);
    session.setPermissionMode(mode);
  }
}

/**
 * Ends a session and releases its subprocess.
 *
 * Unlike every other command of a session, only the owner may send it — and the ownership check
 * of the base is exactly that, because a session is only ever watched by its owner's connections
 * in this plan. What is specific here is the `finally`: whatever the subprocess does on the way
 * out, the entry goes and the event is published. A leaked subprocess does not die on its own.
 */
export class CloseSessionUseCase extends SessionCommandUseCase {
  constructor(
    registry: SessionRegistry,
    private readonly broadcaster: SessionBroadcaster,
  ) {
    super(registry);
  }

  async execute(rawSessionId: string, userId: UserId): Promise<void> {
    const { session, handle } = this.require(rawSessionId, userId);

    session.close('closedByUser');

    try {
      await handle.close();
    } finally {
      this.registry.remove(session.id);
      this.broadcaster.publish(session.id, {
        type: 'session.closed',
        payload: { sessionId: session.id.value, reason: 'closedByUser' },
      });
    }
  }
}
