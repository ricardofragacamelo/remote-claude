import { Inject, Injectable } from '@nestjs/common';

import { EndSessionPermissionsUseCase, RequestPermissionUseCase } from '@application/permission';
import type { PermissionResolvedEvent } from '@application/permission';
import type {
  PermissionQuestion,
  PermissionVerdict,
  SessionBroadcaster,
  SessionPermissionGate,
} from '@application/session';
import { SESSION_BROADCASTER, SessionRegistry, observedStatus } from '@application/session';
import type { PermissionResolution } from '@domain/permission';
import { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import { LOGGER, type Logger } from '@shared/logging/logger';

/** What the agent is told when the session it was asking about has gone. */
const SESSION_ENDED = 'the session ended before the request was answered';

/** What it is told when nobody answered in time. Silence never authorises. */
const NOBODY_ANSWERED = 'nobody answered before the deadline';

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
  private readonly waiting = new Map<string, (verdict: PermissionVerdict) => void>();

  constructor(
    @Inject(RequestPermissionUseCase) private readonly requestPermission: RequestPermissionUseCase,
    @Inject(EndSessionPermissionsUseCase)
    private readonly endPermissions: EndSessionPermissionsUseCase,
    @Inject(SessionRegistry) private readonly sessions: SessionRegistry,
    @Inject(SESSION_BROADCASTER) private readonly broadcaster: SessionBroadcaster,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async ask(question: PermissionQuestion): Promise<PermissionVerdict> {
    const live = this.sessions.find(question.sessionId);

    this.logger.debug(
      {
        op: 'claude.permission.request',
        layer: 'adapter',
        sessionId: question.sessionId.value,
        requestId: question.requestId,
        toolName: question.toolName,
      },
      'canUseTool blocked the agent loop',
    );

    const outcome = await this.requestPermission.execute({
      requestId: question.requestId,
      sessionId: question.sessionId,
      userId: live?.session.ownerId ?? UNKNOWN_OWNER,
      toolUseId: question.toolUseId,
      toolName: question.toolName,
      input: question.input,
    });

    if (outcome.kind === 'settled') {
      return verdictOf(outcome.resolution);
    }

    // The one status the UI cannot afford to confuse with `running`: the loop has stopped on a
    // person, and a spinner for something that will never finish on its own is a lie. It is
    // announced from here because this is the only place that knows.
    this.announce(question.sessionId, 'permission.requested');

    return this.wait(question);
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
    waiting?.(verdictOf(resolution));
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
      const settle = (verdict: PermissionVerdict): void => {
        this.waiting.delete(question.requestId);
        question.signal.removeEventListener('abort', onAbort);
        resolve(verdict);
      };

      const onAbort = (): void => {
        settle({ decision: 'deny', reason: SESSION_ENDED });
      };

      if (question.signal.aborted) {
        resolve({ decision: 'deny', reason: SESSION_ENDED });
        return;
      }

      question.signal.addEventListener('abort', onAbort, { once: true });
      this.waiting.set(question.requestId, settle);
    });
  }
}

/** A settled request, in the two values the agent loop understands. */
function verdictOf(resolution: PermissionResolution): PermissionVerdict {
  return {
    decision: resolution.decision,
    // The deadline's refusal carries no reason, because nobody gave one. Claude still needs a
    // sentence to work with, and this is the only place it can honestly be supplied.
    reason: resolution.reason ?? (resolution.decision === 'deny' ? NOBODY_ANSWERED : null),
  };
}
