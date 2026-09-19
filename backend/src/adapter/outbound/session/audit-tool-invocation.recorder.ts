import { Inject, Injectable } from '@nestjs/common';

import { RecordToolInvocationUseCase } from '@application/audit';
import { SESSION_BROADCASTER, SessionRegistry } from '@application/session';
import type {
  SessionBroadcaster,
  ToolInvocation,
  ToolInvocationRecorder,
} from '@application/session';
import { AuditUnavailableError } from '@domain/audit';
import { UserId } from '@domain/auth';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * The `PreToolUse` hook, joined to the audit trail.
 *
 * It **records and lets through**. It does not decide — deciding is `canUseTool`'s job, and
 * confusing the two is the hole this separation exists to close: the hook fires for every tool,
 * the callback only for the ones that need a human (measured: four hooks, one callback, in the
 * fixture this suite replays).
 *
 * What it may do is refuse. Without a trail there is no authorisation, so a write that fails
 * throws, and a throw from the hook stops the tool. The grading of that failure is the use case's
 * ([D-07](../../../../../docs/plans/01-live-session/decisions.md)): the first denies the tool with
 * the session alive, the second consecutive one ends the session with an explicit reason.
 */
/**
 * Who a tool belongs to when the session is already gone.
 *
 * It happens when a hook fires during teardown. The invocation is still recorded — a gap in the
 * trail is worse than a row whose owner we could not resolve — and the placeholder says exactly
 * that rather than guessing at a person.
 */
const UNKNOWN_OWNER = UserId.create('unknown');

@Injectable()
export class AuditToolInvocationRecorder implements ToolInvocationRecorder {
  constructor(
    @Inject(RecordToolInvocationUseCase)
    private readonly recordInvocation: RecordToolInvocationUseCase,
    @Inject(SessionRegistry) private readonly registry: SessionRegistry,
    @Inject(SESSION_BROADCASTER) private readonly broadcaster: SessionBroadcaster,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * @throws {AuditUnavailableError} when the trail could not be written — which refuses the tool
   */
  async record(invocation: ToolInvocation): Promise<void> {
    const live = this.registry.find(invocation.sessionId);

    const outcome = await this.recordInvocation.execute({
      // The session knows its owner; the hook does not. Reading it here rather than threading it
      // through the SDK keeps the adapter from inventing an identity when a session has gone.
      userId: live?.session.ownerId ?? UNKNOWN_OWNER,
      sessionId: invocation.sessionId,
      toolUseId: invocation.toolUseId,
      toolName: invocation.toolName,
      input: invocation.input,
      // `recorded` and not `allowed`: the hook fires before anybody has voted, and calling this
      // an approval would make the trail claim a decision that has not been taken.
      decision: 'recorded',
      origin: { deviceId: null, ip: null },
      at: invocation.at,
    });

    if (outcome === 'recorded') {
      return;
    }

    const failure =
      this.recordInvocation.lastFailure ?? new AuditUnavailableError(1, new Error('unknown'));

    this.logger.error(
      {
        op: 'audit.append',
        layer: 'adapter',
        sessionId: invocation.sessionId.value,
        toolName: invocation.toolName,
        consecutiveFailures: failure.consecutiveFailures,
        err: failure.cause,
      },
      'the audit trail could not be written — the tool is refused',
    );

    // Silence here would mean a tool refused for a reason nobody on the other end can see.
    this.broadcaster.publishError(invocation.sessionId, failure);

    if (outcome === 'closeSession') {
      await this.endSession(invocation);
    }

    throw failure;
  }

  /** Ends a session whose trail has failed twice in a row, with the reason saying why. */
  private async endSession(invocation: ToolInvocation): Promise<void> {
    const live = this.registry.find(invocation.sessionId);
    if (live === null) {
      return;
    }

    live.session.close('auditUnavailable');
    this.registry.remove(invocation.sessionId);

    try {
      await live.handle.close();
    } finally {
      this.broadcaster.publish(invocation.sessionId, {
        type: 'session.closed',
        payload: { sessionId: invocation.sessionId.value, reason: 'auditUnavailable' },
      });
    }
  }
}
