import { PermissionRule, patternForInvocation } from '@domain/permission';
import type { PermissionAnswer, PermissionRequest, PermissionSettling } from '@domain/permission';
import type { IdGenerator } from '@domain/shared';
import type { PermissionBroadcaster } from './ports/permission-broadcaster.port';
import type { PermissionEvents } from './ports/permission-events.port';
import type { PermissionRequestRepository } from './ports/permission-request.repository';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionSettings } from './permission-settings';

/** How much of a settlement the rest of the system is told about. */
export interface SettlementOptions {
  /**
   * Whether `permission.resolved` goes out on the wire.
   *
   * `false` for the one case where nothing was ever asked: a rule answered the question before
   * anybody was disturbed, and announcing the resolution of a request no client ever saw would
   * put a card on screen only to take it away again.
   */
  readonly announce: boolean;
}

/**
 * Settling a request: the five things that happen, in the one order they may happen in.
 *
 * It is a collaborator rather than a use case because three different callers settle a request —
 * a human answering, a deadline passing, a session ending — and every one of them has to do
 * exactly this. Written three times, it is the third one that forgets to disarm the deadline.
 *
 * The order is not arbitrary:
 *
 * 1. **the entity decides**, and says whether this answer is the one that counts. Everything below
 *    is skipped when somebody got there first, which is what makes a second answer a silent ack
 *    rather than a second execution;
 * 2. **the deadline is disarmed**, before anything that can fail, so a slow database cannot let a
 *    timeout fire over a request that has already been answered;
 * 3. **the rule is remembered**, if one was granted;
 * 4. **the history is written**;
 * 5. **the wire and the bus are told** — and the bus last, because it is what releases the agent
 *    loop, and releasing it before the record exists would let the tool run ahead of its own
 *    history.
 */
export class PermissionSettlement {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly requests: PermissionRequestRepository,
    private readonly broadcaster: PermissionBroadcaster,
    private readonly events: PermissionEvents,
    private readonly ids: IdGenerator,
    private readonly settings: PermissionSettings,
  ) {}

  /** @returns who won, and the decision that actually reached the SDK */
  async settle(
    request: PermissionRequest,
    answer: PermissionAnswer,
    options: SettlementOptions,
  ): Promise<PermissionSettling> {
    const settling = request.resolve(answer);

    if (!settling.won) {
      return settling;
    }

    this.registry.disarm(request.id);
    this.rememberRule(request, answer);

    await this.requests.update(request);

    if (options.announce) {
      this.broadcaster.publish(request.sessionId, {
        type: 'permission.resolved',
        payload: {
          requestId: request.id,
          decision: answer.decision,
          auto: answer.auto,
          ...(answer.resolvedBy === null ? {} : { resolvedBy: answer.resolvedBy.value }),
          ...(answer.resolvedFrom === null ? {} : { resolvedFrom: answer.resolvedFrom }),
        },
      });
    }

    this.events.resolved({ request });

    return settling;
  }

  /**
   * Turns a `session`-scoped answer into a rule, when one can honestly be written.
   *
   * Two things stop it, and both fall back to a one-off rather than widening. An input with no
   * field a pattern can name would only produce a **whole-tool** rule, which is far more than
   * what was approved; and a value that would make the pattern read back as something else is a
   * rule that means one thing to us and another to the SDK.
   */
  private rememberRule(request: PermissionRequest, answer: PermissionAnswer): void {
    if (answer.scope !== 'session' || answer.resolvedBy === null) {
      return;
    }

    const pattern = patternForInvocation(request.toolName, request.input);
    if (pattern === null) {
      return;
    }

    this.registry.addRule(
      PermissionRule.create(
        {
          id: this.ids.next(),
          userId: answer.resolvedBy,
          sessionId: request.sessionId,
          pattern,
          decision: answer.decision,
          scope: 'session',
          createdAt: answer.at,
          expiresAt: new Date(answer.at.getTime() + this.settings.ruleLifetimeMs),
        },
        this.settings.ruleLifetimeMs,
      ),
    );
  }
}
