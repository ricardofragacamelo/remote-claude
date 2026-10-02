import type { RecordAuditEventUseCase } from '@application/audit';
import type { Clock, IdGenerator } from '@domain/shared';
import {
  ClaudeUnavailableError,
  forkPointOf,
  refuseUnsupportedEffort,
  resumeStrategyFor,
  Session,
  SessionForkRejectedError,
  SessionId,
  SessionNotFoundError,
} from '@domain/session';
import type { PermissionMode, ResumeStrategy, SessionCloseReason } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import type { WorkspacePath } from '@domain/workspace';
import type { ModelCatalog } from './command-catalog';
import type { StartSessionCommand } from './commands/start-session.command';
import type {
  ClaudeSessionPort,
  ClaudeSessionStart,
  SessionConversation,
  SessionEvent,
} from './ports/claude-session.port';
import type { ResumableConversationSource } from './ports/resumable-conversation.source';
import type { SessionBroadcaster } from './ports/session-broadcaster.port';
import type { SessionOriginRepository } from './ports/session-origin.repository';
import type { WorkspaceResolver } from './ports/workspace-resolver.port';
import { observedStatus } from './session-status';
import type { LiveSession, SessionRegistry } from './session-registry';

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

/** What continuing a conversation needs beyond opening one: where to ask about it, and the trail. */
export interface SessionResumption {
  readonly conversations: ResumableConversationSource;

  /** Picking a conversation up again is a fact of the trail, written before anything is spawned. */
  readonly trail: RecordAuditEventUseCase;
}

/** A session a `session.start` answered with. */
export interface StartedSession {
  readonly session: Session;
  readonly conversation: SessionConversation;

  /**
   * The conversation was already live for the caller, and nothing was spawned: the caller joins
   * the session that holds it. Resuming what is live is an attach (S-24).
   */
  readonly joined: boolean;
}

/**
 * Opens a session of Claude on a workspace — a new conversation, or one continued.
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
 *
 * A resume adds three rules of its own (B-10…B-13):
 *
 * - **the origin decides how** — ours continues in its file, one begun elsewhere is forked under a
 *   new id of ours. See `resumeStrategyFor`;
 * - **what is live is joined, never spawned again** — a second `query()` on one conversation is two
 *   writers in one JSONL (S-24), and two resumes arriving together are one (S-25);
 * - **it is written to the trail before anything is spawned** (S-27), and a trail that cannot take
 *   it is a resume that does not happen — the same rule an approval follows.
 */
export class StartSessionUseCase {
  /** Resumes in flight, by caller and conversation, so a second one joins the first (S-25). */
  private readonly resuming = new Map<string, Promise<StartedSession>>();

  constructor(
    private readonly workspaces: WorkspaceResolver,
    private readonly registry: SessionRegistry,
    private readonly claude: ClaudeSessionPort,
    private readonly broadcaster: SessionBroadcaster,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly defaults: SessionDefaults,
    private readonly provenance: SessionProvenance,
    private readonly resumption: SessionResumption,
    private readonly models: ModelCatalog | null = null,
  ) {}

  /**
   * @throws {import('@domain/workspace').WorkspaceNotAllowedError} path outside every root (S-23)
   * @throws {import('@domain/transcript').InvalidClaudeSessionIdError} a resume id that is no UUID
   * @throws {SessionNotFoundError} a conversation that does not exist in that workspace, or is
   *   somebody else's — the same answer (S-22)
   * @throws {import('@domain/session').SessionLimitReachedError} the installation is full (S-26)
   * @throws whatever recording the provenance or the trail threw — and then nothing was spawned
   */
  async execute(command: StartSessionCommand): Promise<StartedSession> {
    const workspace = await this.workspaces.resolve(command.workspacePath, command.userId);
    this.refuseUnsupportedEffort(command, workspace);

    if (command.resumeSessionId === null) {
      return this.launch(command, workspace, async (session) => ({
        claudeSessionId: await this.recordOrigin(session),
        resumedFrom: null,
      }));
    }

    const id = ClaudeSessionId.create(command.resumeSessionId);

    return command.forkAt == null
      ? this.resume(command, workspace, id)
      : this.fork(command, workspace, id, command.forkAt);
  }

  /**
   * An effort the model is known not to take is refused before anything is spawned (D-16, S-171).
   * Known only from a list the installation gave for this workspace; with none, nothing is refused.
   *
   * @throws {import('@domain/session').EffortUnsupportedError}
   */
  private refuseUnsupportedEffort(command: StartSessionCommand, workspace: WorkspacePath): void {
    const models = this.models?.latestFor(workspace.value) ?? null;

    if (command.effort != null && models !== null) {
      refuseUnsupportedEffort(models, command.model ?? this.defaults.model, command.effort);
    }
  }

  /**
   * Edit-and-resend (plan 08, D-19): a new conversation that continues `id` up to **before** the
   * prompt `messageId`, always under a new id — the original stays as it was, readable. Forking from
   * the first prompt keeps nothing, and is a fresh conversation.
   *
   * @throws {SessionNotFoundError} the conversation is not one the caller may continue here
   * @throws {import('@domain/session').ForkPointUnknownError} `messageId` is not one of its prompts
   */
  private async fork(
    command: StartSessionCommand,
    workspace: WorkspacePath,
    id: ClaudeSessionId,
    messageId: string,
  ): Promise<StartedSession> {
    const { conversations, trail } = this.resumption;
    const candidate = await conversations.find(id);

    if (
      candidate === null ||
      resumeStrategyFor(candidate, { userId: command.userId, workspace }) === null
    ) {
      throw new SessionNotFoundError(id.value);
    }

    const point = forkPointOf(await conversations.chainOf(id), messageId);
    const at =
      point.kind === 'after' ? { keepUpTo: point.keepUpTo, dropsTurn: point.dropsTurn } : null;

    return this.launch(
      command,
      workspace,
      async (session) => {
        const claudeSessionId = await this.recordOrigin(session);

        if (at === null) {
          return { claudeSessionId, resumedFrom: null };
        }

        await trail.execute({
          userId: session.ownerId,
          kind: 'session.forked',
          subjectId: id.value,
          subjectLabel: workspace.value,
          at: session.openedAt,
        });

        return { claudeSessionId, resumedFrom: id };
      },
      at,
    );
  }

  /** Joins what is live, joins what is starting, and only otherwise continues the conversation. */
  private async resume(
    command: StartSessionCommand,
    workspace: WorkspacePath,
    id: ClaudeSessionId,
  ): Promise<StartedSession> {
    const live = this.registry.findConversation(id, command.userId);

    if (live !== null) {
      return joined(live);
    }

    // Checked and set with no `await` in between, so two resumes arriving together cannot both
    // find the map empty.
    const key = `${command.userId.value} ${id.value}`;
    const inFlight = this.resuming.get(key);

    if (inFlight !== undefined) {
      return { ...(await inFlight), joined: true };
    }

    const resuming = this.continueConversation(command, workspace, id);
    this.resuming.set(key, resuming);

    try {
      return await resuming;
    } finally {
      this.resuming.delete(key);
    }
  }

  private async continueConversation(
    command: StartSessionCommand,
    workspace: WorkspacePath,
    id: ClaudeSessionId,
  ): Promise<StartedSession> {
    const candidate = await this.resumption.conversations.find(id);
    const strategy =
      candidate === null
        ? null
        : resumeStrategyFor(candidate, { userId: command.userId, workspace });

    if (strategy === null) {
      throw new SessionNotFoundError(id.value);
    }

    return this.launch(command, workspace, async (session) => {
      const conversation = await this.conversationFor(session, id, strategy);

      await this.resumption.trail.execute({
        userId: session.ownerId,
        kind: strategy === 'fork' ? 'session.forked' : 'session.resumed',
        subjectId: id.value,
        // The workspace, and never the summary: the summary is the first prompt, and nothing the
        // conversation said is copied into this database (S-28).
        subjectLabel: workspace.value,
        at: session.openedAt,
      });

      return conversation;
    });
  }

  /** In place keeps the id; a fork gets one of ours, recorded as ours before it exists. */
  private async conversationFor(
    session: Session,
    id: ClaudeSessionId,
    strategy: ResumeStrategy,
  ): Promise<SessionConversation> {
    return strategy === 'fork'
      ? { claudeSessionId: await this.recordOrigin(session), resumedFrom: id }
      : { claudeSessionId: id, resumedFrom: id };
  }

  /**
   * Takes a slot, settles the conversation, spawns, and registers.
   *
   * @param conversationFor what the conversation is. It runs once the session has an id and before
   *   anything is spawned — that is where the provenance and the trail are written.
   */
  private async launch(
    command: StartSessionCommand,
    workspace: WorkspacePath,
    conversationFor: (session: Session) => Promise<SessionConversation>,
    forkAt: ClaudeSessionStart['forkAt'] = null,
  ): Promise<StartedSession> {
    // Taken before anything is spawned, and given back in the `finally`. Checking the count and
    // only then awaiting a subprocess would let two starts both see room and both spawn, which is
    // the orphan the limit exists to prevent.
    const session = Session.open({
      id: SessionId.create(this.ids.next()),
      ownerId: command.userId,
      workspace,
      model: command.model ?? this.defaults.model,
      permissionMode: command.permissionMode ?? this.defaults.permissionMode,
      openedAt: this.clock.now(),
      openedFrom: command.openedFrom,
    });
    this.registry.reserve();

    try {
      const conversation = await conversationFor(session);
      this.registry.announce(session, conversation);

      const handle = await this.claude.start({
        sessionId: session.id,
        workspace,
        model: command.model,
        permissionMode: session.permissionMode,
        conversation,
        effort: command.effort ?? null,
        forkAt,
        onEvent: (event) => {
          this.onEvent(session, event);
        },
        onClosed: (reason) => {
          this.onClosed(session, reason);
        },
        onForkRejected: () => {
          // Said once, and not retried: the CLI refuses the same point the same way every time.
          // The screen offers the plain resume instead (S-164).
          this.broadcaster.publishError(
            session.id,
            new SessionForkRejectedError(
              (conversation.resumedFrom ?? conversation.claudeSessionId).value,
            ),
          );
        },
      });

      // The subprocess is up and nothing is running in it: that is `idle`, and it is what
      // `session.started` means. Without this the machine stays in `starting`, which reaches only
      // `idle` and `closed` — so the first delta of the first turn would find an illegal
      // transition, be dropped by `observe`, and leave the status frozen for the life of the
      // session.
      session.observe('idle');
      this.registry.add({ session, handle, conversation });

      return { session, conversation, joined: false };
    } finally {
      // A start that failed is listed as starting no longer; one that succeeded already moved to
      // the live sessions, and withdrawing it is a no-op.
      this.registry.withdraw(session.id);
      this.registry.release();
    }
  }

  /** Mints the id of a new conversation and records it as ours, before anything is spawned. */
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
    // Claude saying anything is activity: the idle clock counts from the last of it (D-02).
    session.recordActivity(this.clock.now());

    const moved = observedStatus(session, event.type);

    this.broadcaster.publish(session.id, event);

    if (moved !== null) {
      this.broadcaster.publish(session.id, {
        type: 'session.statusChanged',
        payload: { status: moved },
      });
    }

    if (event.type === 'turn.completed') {
      this.nextPrompt(session);
    }
  }

  /**
   * The turn ended: the next prompt of the queue goes to Claude as a turn of its own, and everybody
   * watching is told it left the queue (plan 08, D-14, S-160).
   */
  private nextPrompt(session: Session): void {
    const next = session.prompts.turnEnded();
    const live = next === null ? null : this.registry.find(session.id);

    if (next === null || live === null) {
      return;
    }

    live.handle.prompt(next.text, next.extras);
    this.broadcaster.publish(session.id, {
      type: 'prompt.dequeued',
      payload: { queueId: next.queueId, reason: 'started' },
    });
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

/** A live session, as the answer to a resume that found it already running. */
function joined(live: LiveSession): StartedSession {
  return { session: live.session, conversation: live.conversation, joined: true };
}
