import { PermissionRequest } from '@domain/permission';
import type { Clock } from '@domain/shared';
import type { Scheduler } from '@application/shared';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionSettlement } from './settle-permission';

/**
 * What a deadline does when settling fails.
 *
 * A callback rather than a logger, because `application/` has none and should not: a use case
 * that imported one would have the dependency pointing outward. It exists at all because a
 * scheduler callback has nobody to return a promise to — a rejection there is an unhandled one,
 * and an unhandled rejection is how a Node process ends up dying over a database blip.
 */
export type DeadlineFailureReporter = (error: unknown, requestId: string) => void;

/**
 * The only timeout there is.
 *
 * Measured, and the reason this class exists: the CLI held a permission open for 150 s without
 * giving up, emitting an error or ever calling back
 * (docs/discovery/01-descoberta-claude-agent-sdk.md#84). Nothing below us will ever end a request,
 * so if this fails to fire the session hangs until somebody notices.
 *
 * Arming goes through the registry so a deadline is always cancellable by request id, and always
 * cancelled when the request is settled — a timer that outlives its request is a `deny` landing on
 * something a person already said yes to.
 */
export class PermissionDeadlines {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly settlement: PermissionSettlement,
    private readonly scheduler: Scheduler,
    private readonly clock: Clock,
    private readonly reportFailure: DeadlineFailureReporter,
  ) {}

  /** Arms — or re-arms, after an extension — the refusal that silence earns. */
  arm(request: PermissionRequest): void {
    const delay = request.expiresAt.getTime() - this.clock.now().getTime();

    this.registry.arm(
      request.id,
      this.scheduler.after(delay, () => {
        // Not awaited, because a scheduler callback has nobody to return a promise to — and for
        // exactly that reason the rejection is caught here rather than escaping as an unhandled
        // one. A failure leaves the request pending, which the session's own teardown settles.
        void this.settlement
          .settle(request, PermissionRequest.expiry(this.clock.now()), { announce: true })
          .catch((error: unknown) => {
            this.reportFailure(error, request.id);
          });
      }),
    );
  }
}
