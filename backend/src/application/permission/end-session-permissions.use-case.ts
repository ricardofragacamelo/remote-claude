import { PermissionRequest } from '@domain/permission';
import type { SessionId } from '@domain/session';
import type { Clock } from '@domain/shared';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionSettlement } from './settle-permission';

/**
 * A session ended with questions still open.
 *
 * Every one of them is settled as a refusal, because that is what actually happened: the loop they
 * were blocking is gone, and nobody is going to answer. Leaving them pending would leave rows in
 * the history claiming a person is still deciding, and a registry that grows by one entry per
 * session that ever ran.
 *
 * It is the same refusal the deadline gives — no, from nobody — and for the same reason.
 */
export class EndSessionPermissionsUseCase {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly settlement: PermissionSettlement,
    private readonly clock: Clock,
  ) {}

  async execute(sessionId: SessionId): Promise<void> {
    const pending = this.registry.forgetSession(sessionId);
    const at = this.clock.now();

    for (const request of pending) {
      // Announced, even though the session is closing: a client that still has the card on screen
      // has to be told it is over, and the terminal event of the session says nothing about which
      // question went unanswered.
      await this.settlement.settle(request, PermissionRequest.expiry(at), { announce: true });
    }
  }
}
