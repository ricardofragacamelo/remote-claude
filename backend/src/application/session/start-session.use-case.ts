import type { Clock, IdGenerator } from '@domain/shared';
import { ClaudeUnavailableError, Session, SessionId } from '@domain/session';
import type { PermissionMode, SessionCloseReason } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import type { StartSessionCommand } from './commands/start-session.command';
import type { ClaudeSessionPort, SessionEvent } from './ports/claude-session.port';
import type { SessionBroadcaster } from './ports/session-broadcaster.port';
import type { SessionOriginRepository } from './ports/session-origin.repository';
import type { WorkspaceResolver } from './ports/workspace-resolver.port';
import { observedStatus } from './session-status';
import type { SessionRegistry } from './session-registry';

/** What the installation opens a session with when the client states no preference. */
export interface SessionDefaults {
  readonly model: string;
  readonly permissionMode: PermissionMode;
}

/**
 * How a new conversation of Claude is named, and where it is recorded as ours.
 *
 * Together because they are one step: the id is minted to be recorded, and a record without the id
 * handed to the SDK would name a transcript that never exists.
 */
export interface SessionProvenance {
  /** Mints the UUID the SDK is told to use. */
  readonly ids: IdGenerator;
  readonly origins: SessionOriginRepository;
}

/**
 * Opens a session of Claude on a workspace.
 *
 * The order of the first two steps is the security of the product: the path clears the allowlist
 * **before** a slot is taken and long before a subprocess exists, because `cwd` of the SDK's
 * `query()` is exactly that path. A session that got as far as spawning on an unchecked directory
 * is a shell on the user's machine.
 *
 * The third step is the provenance, and it too comes before the subprocess. It is what later says
 * that the conversation is ours — and so whose it is, and whether a resume may write into it
 * ([D-04](../../../../docs/plans/04-transcript-and-resume/decisions.md)). A session whose origin
 * could not be recorded is not opened: it would read as somebody else's for the rest of its life.
 */
export class StartSessionUseCase {
  constructor(
    private readonly workspaces: WorkspaceResolver,
    private readonly registry: SessionRegistry,
    private readonly claude: ClaudeSessionPort,
    private readonly broadcaster: SessionBroadcaster,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly defaults: SessionDefaults,
    private readonly provenance: SessionProvenance,
  ) {}

  /**
   * @throws {import('@domain/workspace').WorkspaceNotAllowedError} path outside every root
   * @throws {import('@domain/session').SessionLimitReachedError} the installation is full
   * @throws whatever recording the provenance threw — and then nothing was spawned
   */
  async execute(command: StartSessionCommand): Promise<Session> {
    const workspace = await this.workspaces.resolve(command.workspacePath, command.userId);

    // Taken before anything is spawned, and given back in the `finally`. Checking the count and
    // only then awaiting a subprocess would let two starts both see room and both spawn, which is
    // the orphan the limit exists to prevent.
    this.registry.reserve();

    try {
      const session = Session.open({
        id: SessionId.create(this.ids.next()),
        ownerId: command.userId,
        workspace,
        model: command.model ?? this.defaults.model,
        permissionMode: command.permissionMode ?? this.defaults.permissionMode,
        openedAt: this.clock.now(),
      });

      // A resume keeps the id the conversation already has, and whose it is was settled when it
      // was opened. Resuming is the next phase's (F2); until then it records nothing new.
      const claudeSessionId =
        command.resumeSessionId === null ? await this.recordOrigin(session) : null;

      const handle = await this.claude.start({
        sessionId: session.id,
        workspace,
        model: command.model,
        permissionMode: session.permissionMode,
        resumeSessionId: command.resumeSessionId,
        claudeSessionId,
        onEvent: (event) => {
          this.onEvent(session, event);
        },
        onClosed: (reason) => {
          this.onClosed(session, reason);
        },
      });

      // The subprocess is up and nothing is running in it: that is `idle`, and it is what
      // `session.started` means. Without this the machine stays in `starting`, which reaches only
      // `idle` and `closed` — so the first delta of the first turn would find an illegal
      // transition, be dropped by `observe`, and leave the status frozen for the life of the
      // session.
      session.observe('idle');
      this.registry.add({ session, handle });

      return session;
    } finally {
      this.registry.release();
    }
  }

  /** Mints the id of the new conversation and records it as ours, before anything is spawned. */
  private async recordOrigin(session: Session): Promise<ClaudeSessionId> {
    const claudeSessionId = ClaudeSessionId.create(this.provenance.ids.next());

    await this.provenance.origins.record({
      claudeSessionId,
      sessionId: session.id,
      openedBy: session.ownerId,
      workspace: session.workspace,
      openedAt: session.openedAt,
    });

    return claudeSessionId;
  }

  /**
   * Moves the machine, publishes the event, and announces the status when it actually changed.
   *
   * The status is derived here and published as its own event rather than being attached to every
   * event: a client that only ever sees deltas still learns that the session went from `thinking`
   * to `waitingPermission`, which is the transition it cannot afford to miss.
   */
  private onEvent(session: Session, event: SessionEvent): void {
    const moved = observedStatus(session, event.type);

    this.broadcaster.publish(session.id, event);

    if (moved !== null) {
      this.broadcaster.publish(session.id, {
        type: 'session.statusChanged',
        payload: { status: moved },
      });
    }
  }

  /** The stream ended, for whatever reason. The entry goes, and everybody watching is told. */
  private onClosed(session: Session, reason: SessionCloseReason): void {
    const wasClosed = session.isClosed;

    session.close(reason);
    this.registry.remove(session.id);

    // A session closed by the `close` use case has already been announced; announcing it twice
    // would put two terminal events in the replay buffer and make the UI choose between them.
    if (wasClosed) {
      return;
    }

    // A crash is reported as a failure of its own before the terminal event: `session.closed`
    // says the session is over, and `CLAUDE_UNAVAILABLE` says whose fault that was. Without it a
    // subprocess that died looks exactly like a turn that finished.
    if (reason === 'failed') {
      this.broadcaster.publishError(session.id, new ClaudeUnavailableError(session.id.value));
    }

    this.broadcaster.publish(session.id, {
      type: 'session.closed',
      payload: { sessionId: session.id.value, reason: session.closeReason ?? reason },
    });
  }
}
