import { PermissionScopeUnsupportedError, isLivePermissionScope } from '@domain/permission';
import type { PermissionSettling } from '@domain/permission';
import type { Clock } from '@domain/shared';
import { answerableRequest } from './answerable-request';
import type { ResolvePermissionCommand } from './commands/resolve-permission.command';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionSettlement } from './settle-permission';

/**
 * One human answering one question.
 *
 * Three refusals guard it, and each one answers a different way of getting it wrong:
 *
 * - a request id nobody is holding open is a record that is not there: 404;
 * - a caller who is not watching that session is an **authorisation** failure: 403. The credential
 *   is good; they still may not answer this
 *   ([D-17](../../../../docs/plans/01-live-session/decisions.md));
 * - a scope this build cannot honour is refused rather than quietly downgraded to `once`.
 *
 * **Losing the race is not an error.** The second answer gets an ordinary outcome carrying the
 * decision that actually reached the SDK, so the client can show who won rather than a failure
 * (docs/architecture/web/04-state-and-data.md#a-fila-de-permissão).
 */
export class ResolvePermissionUseCase {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly settlement: PermissionSettlement,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRequestNotFoundError} unknown request id
   * @throws {import('@domain/permission').PermissionNotOwnedError} not watching that session
   * @throws {PermissionScopeUnsupportedError} a scope this build does not implement
   * @throws {import('@domain/permission').PermissionReasonRequiredError} a refusal with no reason
   */
  async execute(command: ResolvePermissionCommand): Promise<PermissionSettling> {
    const request = answerableRequest(this.registry, command);
    const scope = command.scope ?? 'once';
    if (!isLivePermissionScope(scope)) {
      throw new PermissionScopeUnsupportedError(scope);
    }

    return this.settlement.settle(
      request,
      {
        decision: command.decision,
        reason: command.reason,
        scope,
        resolvedBy: command.userId,
        resolvedFrom: command.resolvedFrom,
        auto: false,
        at: this.clock.now(),
      },
      { announce: true },
    );
  }
}
