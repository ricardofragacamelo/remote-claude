import { Inject, Injectable } from '@nestjs/common';

import {
  ApplyPermissionModeUseCase,
  EndSessionPermissionsUseCase,
  RequestPermissionUseCase,
} from '@application/permission';
import type { PermissionResolvedEvent } from '@application/permission';
import type {
  PermissionQuestion,
  PermissionVerdict,
  SessionBroadcaster,
  SessionPermissionGate,
} from '@application/session';
import { SESSION_BROADCASTER, SessionRegistry, observedStatus } from '@application/session';
import { QUESTION_TOOL } from '@domain/permission';
import type { PermissionResolution } from '@domain/permission';
import { UserId } from '@domain/auth';
import type { PermissionMode, SessionId } from '@domain/session';
import { LOGGER, type Logger } from '@shared/logging/logger';

/** What the agent is told when the session it was asking about has gone. */
const SESSION_ENDED = 'the session ended before the request was answered';

/** What it is told when nobody answered in time. Silence never authorises. */
const NOBODY_ANSWERED = 'nobody answered before the deadline';

/**
 * What it is told when nobody answered a **question** in time — said so that Claude does not take
 * the silence for an answer ([24 · D-07](../../../../../docs/plans/24-structured-questions/decisions.md#f1--backend)).
 * English, because it is for the model.
 */
const QUESTION_NOT_ANSWERED =
  'The user did not answer in time. Do not assume an answer; ask again or stop.';

/**
 * Whose session a request belongs to when the registry has already forgotten it.
 *
 * A tool call can reach `canUseTool` during teardown. Refusing it is the answer either way, and
 * the placeholder says "we could not tell" rather than guessing at a person.
 */
const UNKNOWN_OWNER = UserId.create('unknown');

/**
 * The bridge between `canUseTool` and a human.
 *
 * **This function blocks the agent loop.** While it has not answered, the session is stopped —
 * which is the entire reason the transport is a socket rather than a stream of server-sent events
 * ([ADR-005](../../../../../docs/architecture/shared/00-decisions.md)).
 *
 * What it does *not* do is decide, and that separation is the design. The `permission` module owns
 * the question, the rules, the deadline and the history; this owns the **promise**. It is released
 * by the `permission.resolved` event, whoever caused it — a person on a phone, a deadline, a
 * session ending — so there is exactly one path out of a pending request and every way of
 * settling one goes down it
 * (docs/architecture/backend/03-modules.md#comunicação-assíncrona).
 *
 * It never rejects. A gate that threw would leave the SDK to interpret an exception, and what
 * happens when nobody answers is the one thing that may not be left to interpretation.
 */
@Injectable()
export class PermissionBridge implements SessionPermissionGate {
  /** Requests whose promise is still pending, by request id. */
  private readonly waiting = new Map<string, Waiter>();

  constructor(
    @Inject(RequestPermissionUseCase) private readonly requestPermission: RequestPermissionUseCase,
    @Inject(EndSessionPermissionsUseCase)
    private readonly endPermissions: EndSessionPermissionsUseCase,
    @Inject(ApplyPermissionModeUseCase)
    private readonly applyMode: ApplyPermissionModeUseCase,
    @Inject(SessionRegistry) private readonly sessions: SessionRegistry,
    @Inject(SESSION_BROADCASTER) private readonly broadcaster: SessionBroadcaster,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async ask(question: PermissionQuestion): Promise<PermissionVerdict> {
    this.logger.debug(fieldsOf(question), 'canUseTool blocked the agent loop');

    // Listening starts before asking: an answer that settles the request while it is still being
    // written down would otherwise go past nobody, and the loop would wait for ever.
    const answered = this.wait(question);
    const outcome = await this.asked(question);

    if (outcome.kind === 'settled') {
      this.waiting.get(question.requestId)?.drop();

      // Nobody was asked — a rule, Permitir tudo, or an answer it already had. Said once, with what
      // answered and never with the input, which can carry anything the model wrote (plan 23, S-20).
      this.logger.debug(
        {
          ...fieldsOf(question),
          decision: outcome.resolution.decision,
          via: outcome.resolution.via ?? null,
        },
        'canUseTool answered without asking anybody',
      );

      return verdictOf(outcome.resolution, question.toolName);
    }

    // The one status the UI cannot afford to confuse with `running`: the loop has stopped on a
    // person, and a spinner for something that will never finish on its own is a lie. It is
    // announced from here because this is the only place that knows.
    this.announce(question.sessionId, 'permission.requested');

    return answered;
  }

  /** Hands the question to the `permission` module; a failure drops the listener `ask` set up. */
  private async asked(
    question: PermissionQuestion,
  ): Promise<Awaited<ReturnType<RequestPermissionUseCase['execute']>>> {
    const live = this.sessions.find(question.sessionId);

    try {
      return await this.requestPermission.execute({
        requestId: question.requestId,
        sessionId: question.sessionId,
        userId: live?.session.ownerId ?? UNKNOWN_OWNER,
        // What a `project` rule is granted for, and the mode as it is **now** — it can change while
        // the session runs. A session already forgotten reads as `plan`, where no `allow` answers.
        projectPath: live?.session.workspace.value ?? null,
        permissionMode: live?.session.permissionMode ?? 'plan',
        toolUseId: question.toolUseId,
        toolName: question.toolName,
        input: question.input,
      });
    } catch (error) {
      this.waiting.get(question.requestId)?.drop();
      throw error;
    }
  }

  /**
   * Ends everything a session left open.
   *
   * Two halves, and both are needed. The promises here are released by the abort signal the runner
   * fires; the **requests** are settled by the `permission` module, which is what stops a row in
   * the history from claiming for ever that somebody is still deciding.
   */
  forget(sessionId: SessionId): void {
    this.endPermissions.execute(sessionId).catch((error: unknown) => {
      this.logger.error(
        {
          op: 'claude.permission.request',
          layer: 'adapter',
          sessionId: sessionId.value,
          err: error,
        },
        'the pending permission requests of a closed session could not be settled',
      );
    });
  }

  /**
   * The session switched mode: hands its open questions to the `permission` module, which answers
   * the ones Permitir tudo covers. Never rejects — the mode has already changed, and a failure here
   * leaves the cards on screen for a person, which is the safe side.
   */
  async modeChanged(sessionId: SessionId, mode: PermissionMode): Promise<void> {
    try {
      const answered = await this.applyMode.execute(sessionId, mode);

      this.logger.debug(
        {
          op: 'claude.permission.mode',
          layer: 'adapter',
          sessionId: sessionId.value,
          mode,
          answered,
        },
        'the open requests of the session were re-read under its new mode',
      );
    } catch (error) {
      this.logger.error(
        {
          op: 'claude.permission.mode',
          layer: 'adapter',
          sessionId: sessionId.value,
          mode,
          err: error,
        },
        'the open requests of the session could not be re-read under its new mode',
      );
    }
  }

  /**
   * The `permission.resolved` consumer that releases the loop.
   *
   * It is called for every resolution, including the ones this process is not waiting on — a rule
   * that answered without anybody being asked, a request belonging to another session. An unknown
   * id is simply not in the map, and that is the whole guard it needs.
   */
  onResolved(event: PermissionResolvedEvent): void {
    const resolution = event.request.resolution;
    const waiting = this.waiting.get(event.request.id);

    if (resolution === null) {
      return;
    }

    this.announce(event.request.sessionId, 'permission.resolved');

    // Not every resolution is one this process is waiting on: a rule may have answered without
    // anybody being asked, and another session's request reaches every consumer of the bus.
    waiting?.release(verdictOf(resolution, event.request.toolName));
  }

  /** Moves the session's status from an event of the permission flow, and publishes the move. */
  private announce(sessionId: SessionId, eventType: string): void {
    const live = this.sessions.find(sessionId);

    if (live === null) {
      return;
    }

    const moved = observedStatus(live.session, eventType);

    if (moved !== null) {
      this.broadcaster.publish(sessionId, {
        type: 'session.statusChanged',
        payload: { status: moved },
      });
    }
  }

  /**
   * The promise the agent loop is held open by.
   *
   * `options.signal` is honoured, and it is honoured by **refusing**: the SDK fires it when the
   * session dies, and a request whose session has gone is a question nobody will answer.
   */
  private wait(question: PermissionQuestion): Promise<PermissionVerdict> {
    return new Promise<PermissionVerdict>((resolve) => {
      const drop = (): void => {
        this.waiting.delete(question.requestId);
        question.signal.removeEventListener('abort', onAbort);
      };

      const release = (verdict: PermissionVerdict): void => {
        drop();
        resolve(verdict);
      };

      const onAbort = (): void => {
        release(ENDED);
      };

      if (question.signal.aborted) {
        resolve(ENDED);
        return;
      }

      question.signal.addEventListener('abort', onAbort, { once: true });
      this.waiting.set(question.requestId, { release, drop });
    });
  }
}

/** The loop held open on one request: released with a verdict, or dropped when nobody was asked. */
interface Waiter {
  readonly release: (verdict: PermissionVerdict) => void;
  readonly drop: () => void;
}

/** What every line about one question says: which session, which request, which tool — never the input. */
function fieldsOf(question: PermissionQuestion): Record<string, unknown> {
  return {
    op: 'claude.permission.request',
    layer: 'adapter',
    sessionId: question.sessionId.value,
    requestId: question.requestId,
    toolName: question.toolName,
  };
}

/** The verdict of a request whose session has gone. */
const ENDED: PermissionVerdict = { decision: 'deny', reason: SESSION_ENDED, answers: null };

/** A settled request, in the values the agent loop understands — with the answers of a question. */
function verdictOf(resolution: PermissionResolution, toolName: string): PermissionVerdict {
  return {
    decision: resolution.decision,
    // The deadline's refusal carries no reason, because nobody gave one. Claude still needs a
    // sentence to work with, and this is the only place it can honestly be supplied.
    reason: resolution.reason ?? (resolution.decision === 'deny' ? silenceFor(toolName) : null),
    answers: resolution.answers ?? null,
  };
}

/** What the silence of the deadline says to Claude: of a question, that it was not answered. */
function silenceFor(toolName: string): string {
  return toolName === QUESTION_TOOL ? QUESTION_NOT_ANSWERED : NOBODY_ANSWERED;
}
