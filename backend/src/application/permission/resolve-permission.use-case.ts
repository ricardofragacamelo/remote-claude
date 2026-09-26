import {
  PermissionReasonRequiredError,
  PermissionScopeUnsupportedError,
  isPermissionScope,
  isPersistedPermissionScope,
  patternForInvocation,
} from '@domain/permission';
import type {
  PermissionDecision,
  PermissionRequest,
  PermissionSettling,
  PersistedPermissionScope,
} from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import { answerableRequest } from './answerable-request';
import type { ResolvePermissionCommand } from './commands/resolve-permission.command';
import type { GrantPermissionRuleUseCase } from './grant-permission-rule.use-case';
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
 * - a scope that cannot be honoured for this invocation is refused rather than quietly narrowed or
 *   widened.
 *
 * **`project` and `always` grant a rule first, and settle second.** The rule is the part that can
 * be refused — a lifetime past the ceiling, an input with nothing a pattern can name — and a
 * request settled before its rule was refused would have let the agent loop go on a promise that
 * was then broken. Granted first, a refusal leaves the question open for the person to answer again.
 *
 * **Losing the race is not an error.** The second answer gets an ordinary outcome carrying the
 * decision that actually reached the SDK, so the client can show who won rather than a failure
 * (docs/architecture/web/04-state-and-data.md#a-fila-de-permissão). A rule asked for about a question
 * that was already decided when the answer arrived is not granted.
 */
export class ResolvePermissionUseCase {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly settlement: PermissionSettlement,
    private readonly grant: GrantPermissionRuleUseCase,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRequestNotFoundError} unknown request id
   * @throws {import('@domain/permission').PermissionNotOwnedError} not watching that session
   * @throws {PermissionScopeUnsupportedError} a scope that cannot be honoured for this invocation
   * @throws {PermissionReasonRequiredError} a refusal with no reason
   */
  async execute(command: ResolvePermissionCommand): Promise<PermissionSettling> {
    const request = answerableRequest(this.registry, command);
    const scope = command.scope ?? 'once';
    if (!isPermissionScope(scope)) {
      throw new PermissionScopeUnsupportedError(scope);
    }

    if (isPersistedPermissionScope(scope) && request.isPending) {
      await this.grantFrom(request, command.decision, command.reason, scope, command.userId);
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

  /**
   * The rule an answer with a persisted scope asks for.
   *
   * The narrowest pattern that covers the invocation on screen, never the widest: a person who
   * approves `rm -rf build/` "always" has said nothing about `rm -rf src/`. An input with no field a
   * pattern can name would only give a rule for the **whole tool**, and that is refused (S-58).
   */
  private async grantFrom(
    request: PermissionRequest,
    decision: PermissionDecision,
    reason: string | null,
    scope: PersistedPermissionScope,
    userId: UserId,
  ): Promise<void> {
    // Checked here as well as by the entity, because the rule is granted **before** the entity is
    // asked: a refusal without a reason must not leave a standing rule behind it.
    if (decision === 'deny' && (reason === null || reason.length === 0)) {
      throw new PermissionReasonRequiredError(request.id);
    }

    const pattern = patternForInvocation(request.toolName, request.input);
    if (pattern === null) {
      throw new PermissionScopeUnsupportedError(scope);
    }

    await this.grant.execute({
      userId,
      pattern,
      decision,
      scope,
      projectPath: request.projectPath,
      expiresAt: null,
    });
  }
}
