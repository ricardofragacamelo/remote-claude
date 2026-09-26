import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { RecordToolInvocationUseCase } from '@application/audit';
import type { PermissionResolvedEvent } from '@application/permission';
import { PermissionBridge } from '@adapter/outbound/claude/permission-bridge';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { PERMISSION_RESOLVED } from './emitter-permission.events';

/**
 * The consumer that releases the agent loop.
 *
 * It is registered first because it is the one that costs something when it is late: every other
 * consumer is bookkeeping, and this one is a session standing still. The listener is a class of
 * its own rather than a method on the bridge so that the bridge stays a plain adapter with no
 * framework decorator on the path the SDK calls.
 */
@Injectable()
export class ReleaseAgentLoopOnResolved {
  constructor(@Inject(PermissionBridge) private readonly bridge: PermissionBridge) {}

  @OnEvent(PERMISSION_RESOLVED)
  handle(event: PermissionResolvedEvent): void {
    this.bridge.onResolved(event);
  }
}

/**
 * The consumer that writes the decision to the trail.
 *
 * A **second** entry for the same invocation, and deliberately so. The `PreToolUse` hook already
 * recorded that the tool was about to run; this records what was decided about it and by whom —
 * two different facts, and the question "who authorised this command?" is answered by the second.
 *
 * It never refuses anything, and it is not awaited. Unlike the hook — which may stop a tool that
 * cannot be recorded — this runs after the decision has already reached the SDK, so the only
 * honest thing a failure here can do is be loud.
 *
 * That is safe because neither durable record depends on it. What was **executed** is written by
 * the `PreToolUse` hook, which blocks the tool until it is written; what was **decided** is
 * written to `permission_requests` before anything is told about the resolution. This entry is the
 * trail's copy of a fact already recorded twice, and it is here so that the question "who
 * authorised this command?" can be answered from one table.
 */
@Injectable()
export class RecordDecisionOnResolved {
  constructor(
    @Inject(RecordToolInvocationUseCase)
    private readonly recordInvocation: RecordToolInvocationUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @OnEvent(PERMISSION_RESOLVED)
  handle(event: PermissionResolvedEvent): void {
    const { request } = event;
    const resolution = request.resolution;

    if (resolution === null) {
      return;
    }

    void this.recordInvocation
      .execute({
        // Whoever decided. On the automatic refusal nobody did, and the request's own owner is
        // the honest answer: it is their session that was asked about.
        userId: resolution.resolvedBy ?? request.userId,
        sessionId: request.sessionId,
        toolUseId: request.toolUseId,
        toolName: request.toolName,
        input: request.input,
        decision: resolution.decision === 'allow' ? 'allowed' : 'denied',
        origin: { deviceId: null, ip: null },
        at: resolution.at,
        // What the decision was, written with it: from the entry one reaches the request, the rule
        // that answered and whether anybody did — without reading another module's table (D-15).
        verdict: {
          requestId: request.id,
          auto: resolution.auto,
          ruleId: resolution.ruleId ?? null,
          scope: resolution.scope,
          resolvedBy: resolution.resolvedBy,
          resolvedFrom: resolution.resolvedFrom,
        },
      })
      .then((outcome) => {
        if (outcome !== 'recorded') {
          this.report(event, { outcome });
        }
      })
      .catch((error: unknown) => {
        this.report(event, { err: error });
      });
  }

  /**
   * The one thing a failure here can honestly do.
   *
   * Written once because the two ways it fails — a refusal the use case reports, and a rejection
   * it does not catch — say the same thing about the same record, and a second copy is the one
   * that stops matching the first.
   */
  private report(event: PermissionResolvedEvent, cause: Readonly<Record<string, unknown>>): void {
    this.logger.error(
      {
        op: 'audit.append',
        layer: 'adapter',
        sessionId: event.request.sessionId.value,
        requestId: event.request.id,
        ...cause,
      },
      'the permission decision could not be written to the trail',
    );
  }
}
