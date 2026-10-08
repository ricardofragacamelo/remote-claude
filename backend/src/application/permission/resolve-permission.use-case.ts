import {
  PermissionReasonRequiredError,
  PermissionScopeUnsupportedError,
  isPermissionScope,
  isPersistedPermissionScope,
  reachesFor,
} from '@domain/permission';
import type {
  PermissionDecision,
  PermissionRequest,
  PermissionScope,
  PermissionSettling,
  PersistedPermissionScope,
  RuleReachKind,
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
 *
 * **Answers to one request are taken one at a time, in the order they arrive.** The grant is awaited
 * before the entity decides, so two answers let through together would both find the request
 * pending and both leave their rules, and only then would one of them lose (plan 23, S-65). The
 * second waits for the first, and finds the question decided — or, when the first was refused,
 * still open.
 */
export class ResolvePermissionUseCase {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly settlement: PermissionSettlement,
    private readonly grant: GrantPermissionRuleUseCase,
    private readonly clock: Clock,
  ) {}

  /** The answer being taken for each request id, which the next answer to it waits for. */
  private readonly answering = new Map<string, Promise<PermissionSettling>>();

  /**
   * @throws {import('@domain/permission').PermissionRequestNotFoundError} unknown request id
   * @throws {import('@domain/permission').PermissionNotOwnedError} not watching that session
   * @throws {PermissionScopeUnsupportedError} a scope that cannot be honoured for this invocation
   * @throws {PermissionReasonRequiredError} a refusal with no reason
   */
  async execute(command: ResolvePermissionCommand): Promise<PermissionSettling> {
    const before = this.answering.get(command.requestId);
    // The earlier answer's failure is its own caller's to handle; this one only waits for it.
    const current = (before ?? Promise.resolve()).then(noop, noop).then(() => this.answer(command));
    this.answering.set(command.requestId, current);

    try {
      return await current;
    } finally {
      if (this.answering.get(command.requestId) === current) {
        this.answering.delete(command.requestId);
      }
    }
  }

  private async answer(command: ResolvePermissionCommand): Promise<PermissionSettling> {
    const request = answerableRequest(this.registry, command);
    const scope = command.scope ?? 'once';
    if (!isPermissionScope(scope)) {
      throw new PermissionScopeUnsupportedError(scope);
    }

    const patterns = request.isPending ? patternsOf(request, scope, command.reach ?? null) : [];

    if (isPersistedPermissionScope(scope) && request.isPending) {
      await this.grantFrom(
        request,
        command.decision,
        command.reason,
        scope,
        command.userId,
        patterns,
      );
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
      { announce: true, ...(scope === 'session' ? { sessionPatterns: patterns } : {}) },
    );
  }

  /**
   * The rules an answer with a persisted scope asks for — one per pattern of the chosen reach,
   * granted all or none (plan 23, D-13).
   */
  private async grantFrom(
    request: PermissionRequest,
    decision: PermissionDecision,
    reason: string | null,
    scope: PersistedPermissionScope,
    userId: UserId,
    patterns: readonly string[],
  ): Promise<void> {
    // Checked here as well as by the entity, because the rules are granted **before** the entity
    // is asked: a refusal without a reason must not leave a standing rule behind it.
    if (decision === 'deny' && (reason === null || reason.length === 0)) {
      throw new PermissionReasonRequiredError(request.id);
    }

    await this.grant.executeAll(
      patterns.map((pattern) => ({
        userId,
        pattern,
        decision,
        scope,
        projectPath: request.projectPath,
        expiresAt: null,
      })),
    );
  }
}

function noop(): void {
  // Nothing: see `execute`.
}

/**
 * The patterns the chosen reach leaves rules for, computed again from the request — never taken
 * from the client, which only names the reach.
 *
 * - `once` leaves nothing;
 * - a reach the request does not have is refused, for every scope: the person chose something the
 *   server did not offer, and is told rather than quietly given something else;
 * - no reach named means `exact`. When there is no `exact` either, `session` is a one-off, as it
 *   was before reaches existed, and `project`/`always` are refused (S-58): the only other rule
 *   would be the whole tool, which is far more than what was approved.
 *
 * @throws {PermissionScopeUnsupportedError} as above
 */
function patternsOf(
  request: PermissionRequest,
  scope: PermissionScope,
  reach: RuleReachKind | null,
): readonly string[] {
  if (scope === 'once') {
    return [];
  }

  const chosen = reachesFor(request.toolName, request.input).find(
    (offered) => offered.reach === (reach ?? 'exact'),
  );

  if (chosen !== undefined) {
    return chosen.patterns;
  }

  if (reach !== null || isPersistedPermissionScope(scope)) {
    throw new PermissionScopeUnsupportedError(scope);
  }

  return [];
}
