import type { PermissionMode, SessionId } from '@domain/session';
import type { Clock } from '@domain/shared';
import type { PermissionAutoAnswer } from './permission-auto-answer';
import type { PermissionRegistry } from './permission-registry';

/**
 * A session changed mode: what that means for the questions it already has on screen.
 *
 * Only switching **to** Permitir tudo changes anything. Somebody who turns it on with a card in
 * front of them wants the card gone, and leaving it would cost the extra tap the mode exists to
 * save ([23 · D-06](../../../../docs/plans/23-fluid-permissions/decisions.md)). Each pending request
 * goes through the same {@link PermissionAutoAnswer} a new one does, so a rule that refuses still
 * refuses and a question for the person stays open.
 *
 * Switching away needs nothing: the mode is read on every request, and the next tool asks.
 */
export class ApplyPermissionModeUseCase {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly autoAnswer: PermissionAutoAnswer,
    private readonly clock: Clock,
  ) {}

  /** @returns how many of the session's open questions were answered by the change */
  async execute(sessionId: SessionId, mode: PermissionMode): Promise<number> {
    if (mode !== 'allowAll') {
      return 0;
    }

    let answered = 0;

    // One at a time and in arrival order: each settlement releases a loop, and the order the
    // questions were asked in is the order the tools should run in.
    for (const request of this.registry.pendingFor(sessionId)) {
      if (await this.autoAnswer.tryAnswer(request, mode, this.clock.now())) {
        answered += 1;
      }
    }

    return answered;
  }
}
