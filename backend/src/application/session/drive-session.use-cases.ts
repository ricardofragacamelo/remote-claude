import type { UserId } from '@domain/auth';
import type { IdGenerator } from '@domain/shared';
import {
  commandIn,
  menuOf,
  offers,
  previewOf,
  SessionId,
  UnknownCommandError,
} from '@domain/session';
import type { MenuCommand, PermissionMode, SessionClient, SlashCommand } from '@domain/session';
import type { SessionBroadcaster } from './ports/session-broadcaster.port';
import type { CommandCatalog } from './command-catalog';
import type { OutgoingPrompt, PromptAttachment, PromptContextResolver } from './prompt-context';
import { handOverPrompt } from './prompt-hand-over';
import type { SessionEnder } from './session-ender';
import type { LiveSession, SessionRegistry } from './session-registry';

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

/** What queueing a prompt needs: an id for it, and who to tell that it waits. */
export interface PromptQueueing {
  readonly ids: IdGenerator;
  readonly broadcaster: SessionBroadcaster;

  /** What checks and composes the context of a prompt (plan 08, B-44). */
  readonly context: PromptContextResolver;
}

/**
 * Sends one turn.
 *
 * A prompt that arrives while a turn is running is **queued** and runs next, as a turn of its own.
 * The queue is the backend's since plan 08 (D-14): a prompt handed to the SDK mid-turn is folded
 * into the running turn (measured, discovery §10.4) and cannot be taken back. Held here, every
 * client watching sees it wait (`prompt.queued`) and any of them can take it out first. Refusing it
 * with a `409` was never the answer ([R-02](../../../../docs/plans/00-bootstrap/progress.md)).
 *
 * The one prompt that **is** refused is a slash command the installation does not have (S-34):
 * sent on, the CLI would answer in prose of its own, inside the conversation. The question is asked
 * of the whole list — a command the menu hides still exists — and a list that cannot be had refuses
 * nothing: the menu is discovery, not a boundary, and the prompt box must keep working without it
 * (S-31).
 *
 * Checking a command can wait on the CLI, so the prompts of one session are checked in the order
 * they arrived: a plain prompt sent right after `/init` must not overtake it into the queue. The
 * context of the prompt — files, folders, ranges, uploads, text — is checked in the same step, all
 * or nothing, before anything reaches Claude (plan 08, B-44): a prompt with one bad item is refused
 * whole, and its context goes into the queue with it when a turn is running (S-205).
 *
 * What `execute` answers is the **send**, and the caller runs it once the prompt has been
 * acknowledged. Handing the prompt to the CLI inside the check would let the first events of its
 * turn reach the client before the `command.accepted` of the prompt that caused them — the one
 * ordering the protocol promises (docs/architecture/shared/05-websocket-protocol.md#comandos-cliente--servidor).
 */
export class PromptSessionUseCase extends SessionCommandUseCase {
  /** The last prompt of each session still being checked. */
  private readonly tails = new Map<string, Promise<void>>();

  constructor(
    registry: SessionRegistry,
    private readonly catalog: CommandCatalog,
    private readonly queueing: PromptQueueing,
  ) {
    super(registry);
  }

  /**
   * @param from the client that sent it — what the row of the queue says of its author
   * @returns the send, to run once the prompt was acknowledged: now, or into the queue
   * @throws {UnknownCommandError} the prompt invokes a command the installation does not have
   * @throws {import('@domain/session').SessionLockedError} an undo is putting files back (B-27)
   */
  async execute(
    rawSessionId: string,
    text: string,
    userId: UserId,
    from: SessionClient = 'web',
    attachments: readonly PromptAttachment[] = [],
  ): Promise<() => void> {
    const live = this.require(rawSessionId, userId);
    const key = live.session.id.value;

    const checked = (this.tails.get(key) ?? Promise.resolve()).then(() =>
      this.check(live, text, attachments),
    );

    // The chain only orders; the refusal of this prompt belongs to whoever sent it, and reaches
    // them through the `await` below — never through the prompt checked after it.
    const tail = checked.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });

    const outgoing = await checked;

    return () => {
      this.submit(live, text, outgoing, from);
    };
  }

  /** Hands the prompt to the CLI when no turn runs, and to the queue when one does. */
  private submit(
    live: LiveSession,
    typed: string,
    outgoing: OutgoingPrompt,
    from: SessionClient,
  ): void {
    const prompt = {
      queueId: `q_${this.queueing.ids.next()}`,
      text: outgoing.text,
      ...(outgoing.extras === undefined ? {} : { extras: outgoing.extras }),
      promptedBy: from,
      // What was typed — the row of the queue never shows the context composed after it.
      preview: previewOf(typed),
    };
    const submission = live.session.prompts.submit(prompt);

    if (submission.kind === 'now') {
      handOverPrompt(live, this.queueing.broadcaster, prompt);
      return;
    }

    this.queueing.broadcaster.publish(live.session.id, {
      type: 'prompt.queued',
      payload: {
        queueId: prompt.queueId,
        position: submission.position,
        promptedBy: prompt.promptedBy,
        preview: prompt.preview,
      },
    });
  }

  private async check(
    live: LiveSession,
    text: string,
    attachments: readonly PromptAttachment[],
  ): Promise<OutgoingPrompt> {
    // Before the catalogue, and again after it: the undo may have taken the lock while the list was
    // being asked for, and a prompt let through then would start a turn on a disk halfway back.
    live.session.refusePromptWhileRewinding();

    const command = commandIn(text);

    if (command !== null && !(await this.isOffered(live, command))) {
      throw new UnknownCommandError(command);
    }

    const outgoing = await this.queueing.context.resolve(live, text, attachments);

    live.session.refusePromptWhileRewinding();

    return outgoing;
  }

  /** Whether the installation runs `command` — or `true` when the list cannot be had. */
  private async isOffered(live: LiveSession, command: string): Promise<boolean> {
    let commands: readonly SlashCommand[];

    try {
      commands = await this.catalog.commandsOf(live);
    } catch {
      // Already logged where it failed, by the adapter that asked the CLI. What is decided here is
      // only that a list nobody could read refuses nothing (S-31).
      return true;
    }

    return offers(commands, command);
  }
}

/**
 * Takes a prompt out of the queue before it reaches Claude (plan 08, B-34). Any client watching may.
 *
 * A second cancel of the same prompt is an `ack` with no effect; one that already became a turn is
 * `CONFLICT` — stopping it now is interrupting the turn.
 */
export class CancelQueuedPromptUseCase extends SessionCommandUseCase {
  /**
   * @returns whether the prompt left the queue now — `false` when an earlier cancel took it
   * @throws {import('@domain/session').QueuedPromptStartedError} it already started (S-158)
   * @throws {import('@domain/session').QueuedPromptNotFoundError} the queue never had it (S-159)
   */
  execute(rawSessionId: string, queueId: string, userId: UserId): boolean {
    return this.require(rawSessionId, userId).session.prompts.cancel(queueId) === 'cancelled';
  }
}

/** The menu of one session: what the installation offers, and which CLI said so. */
export interface SessionCommandMenu {
  /** The version of the CLI the session spawned, or `null` when it is not known. */
  readonly cliVersion: string | null;
  readonly commands: readonly MenuCommand[];
}

/**
 * The slash commands a session can run, as the menu shows them (B-14, B-15).
 *
 * From `supportedCommands()` of the session itself, through the catalogue, and never from a list of
 * ours: it changes per installation, per version and per the skills installed. Internal and dead
 * entries are left out by metadata, in the domain, once — rather than twice, in two languages.
 */
export class ListSessionCommandsUseCase extends SessionCommandUseCase {
  constructor(
    registry: SessionRegistry,
    private readonly catalog: CommandCatalog,
  ) {
    super(registry);
  }

  /**
   * @throws {import('@domain/session').SessionNotFoundError} unknown or closed
   * @throws {import('@domain/session').SessionForbiddenError} somebody else's
   * @throws {import('@domain/session').ClaudeUnavailableError} the CLI failed to answer
   * @throws {import('@domain/session').ClaudeTimeoutError} the CLI did not answer in time
   */
  async execute(rawSessionId: string, userId: UserId): Promise<SessionCommandMenu> {
    const live = this.require(rawSessionId, userId);
    const commands = await this.catalog.commandsOf(live);

    return { cliVersion: live.handle.cliVersion, commands: menuOf(commands) };
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
 * in this plan. What it does is the {@link SessionEnder}'s: whatever the subprocess does on the way
 * out, the entry goes and the event is published. A leaked subprocess does not die on its own.
 */
export class CloseSessionUseCase extends SessionCommandUseCase {
  constructor(
    registry: SessionRegistry,
    private readonly ender: SessionEnder,
  ) {
    super(registry);
  }

  async execute(rawSessionId: string, userId: UserId): Promise<void> {
    await this.ender.end(this.require(rawSessionId, userId), 'closedByUser');
  }
}
