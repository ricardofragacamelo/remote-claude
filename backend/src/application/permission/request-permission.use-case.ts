import { PermissionRequest, classifyRisk, matchedInput } from '@domain/permission';
import type { PermissionResolution } from '@domain/permission';
import type { SessionId } from '@domain/session';
import type { Clock } from '@domain/shared';
import type { RequestPermissionCommand } from './commands/request-permission.command';
import type { PermissionBroadcaster } from './ports/permission-broadcaster.port';
import type { PermissionRequestRepository } from './ports/permission-request.repository';
import type { PermissionDeadlines } from './permission-deadlines';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionSettings } from './permission-settings';
import type { PermissionSettlement } from './settle-permission';

/** Either the question is already answered, or it is now on somebody's screen. */
export type PermissionOutcome =
  | { readonly kind: 'settled'; readonly resolution: PermissionResolution }
  | { readonly kind: 'pending'; readonly request: PermissionRequest };

/**
 * What a shell refusal says to Claude when a rule is what refused it.
 *
 * English and technical on purpose: it is not shown to a person, it is handed to the model so it
 * can propose something else instead of retrying the same command. The prose a human reads comes
 * from a `messageKey`, and this is not that.
 */
const DENIED_BY_RULE = 'denied by a rule granted earlier in this session';

/**
 * The four steps `canUseTool` takes, in the one order that is safe.
 *
 * 1. **idempotency.** The SDK redelivers a pending call after a transport gap, and a request id it
 *    has seen before gets the answer it already has — never a second question and never a second
 *    execution;
 * 2. **a rule answers without disturbing anybody.** Somebody who said "for this session" is not
 *    asked again, and no card appears only to vanish;
 * 3. **the question is recorded and published**, in that order, so a request nobody can account
 *    for afterwards cannot reach a screen;
 * 4. **the deadline is armed.** It is the only one there is.
 *
 * What it does **not** do is wait. Waiting belongs to the session runtime, which is holding the
 * SDK's promise — this returns what is known now, and the loop is released by the resolution
 * event ([backend/03](../../../../docs/architecture/backend/03-modules.md#comunicação-assíncrona)).
 */
export class RequestPermissionUseCase {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly requests: PermissionRequestRepository,
    private readonly settlement: PermissionSettlement,
    private readonly deadlines: PermissionDeadlines,
    private readonly broadcaster: PermissionBroadcaster,
    private readonly clock: Clock,
    private readonly settings: PermissionSettings,
  ) {}

  async execute(command: RequestPermissionCommand): Promise<PermissionOutcome> {
    const known = this.registry.find(command.requestId);

    // The **same** question only when it is the same session's. `requestId` is minted by the SDK
    // and is expected to be unique, but "expected" is not a guarantee we can afford here: reusing
    // another session's settled answer would silently authorise a tool nobody was asked about.
    // A collision therefore starts a new question rather than inheriting an old verdict.
    if (known !== null && known.sessionId.equals(command.sessionId)) {
      return outcomeOf(known);
    }

    const now = this.clock.now();
    const request = PermissionRequest.open({
      id: command.requestId,
      sessionId: command.sessionId,
      userId: command.userId,
      toolUseId: command.toolUseId,
      toolName: command.toolName,
      input: command.input,
      riskHint: classifyRisk(command.toolName, command.input),
      requestedAt: now,
      expiresAt: new Date(now.getTime() + this.settings.timeoutMs),
    });

    this.registry.add(request);
    await this.requests.open(request);

    const rule = this.registry.matchingRule(
      command.sessionId,
      command.userId,
      command.toolName,
      command.input,
      now,
    );

    if (rule !== null) {
      // Settled without announcing: nothing was ever asked, so there is no card to resolve. The
      // trail still records the decision — that consumer is on the internal bus, not the wire.
      await this.settlement.settle(
        request,
        {
          decision: rule.decision,
          reason: rule.decision === 'deny' ? DENIED_BY_RULE : null,
          scope: 'session',
          resolvedBy: rule.userId,
          resolvedFrom: null,
          auto: true,
          at: now,
        },
        { announce: false },
      );

      return outcomeOf(request);
    }

    this.deadlines.arm(request);
    this.broadcaster.request(request.sessionId, {
      type: 'permission.requested',
      payload: describe(request),
    });

    return { kind: 'pending', request };
  }

  /**
   * The questions of a session that are still open, as payloads.
   *
   * This is what a reconnecting client is owed, and it comes from the registry rather than from
   * the replay buffer: the buffer would hand back every question ever asked, including the ones
   * answered while the client was away. Only the registry knows which are still blocking a loop
   * ([ADR-012](../../../../docs/architecture/shared/00-decisions.md)).
   */
  pendingFor(sessionId: SessionId): readonly Readonly<Record<string, unknown>>[] {
    return this.registry.pendingFor(sessionId).map((request) => describe(request));
  }
}

/**
 * A request, as the contract's `permission.requested` describes it.
 *
 * `title` is a key rather than a sentence, and `description` is the input itself — the command
 * line, the path being written. Between them the client has everything it needs to say what is
 * being asked, in the language of whoever is holding the device, and the server has sent no prose
 * (docs/architecture/shared/02-i18n.md).
 */
function describe(request: PermissionRequest): Readonly<Record<string, unknown>> {
  const detail = matchedInput(request.input);

  return {
    requestId: request.id,
    // The contract requires it; the SDK does not always give one, and an empty string is a
    // truthful "there was none" where a missing field would break a required one.
    toolUseId: request.toolUseId ?? '',
    toolName: request.toolName,
    title: `permission.tool.${request.toolName}`,
    ...(detail === null ? {} : { description: detail }),
    input: request.input,
    riskHint: request.riskHint,
    // Always. The UI pre-selects refusal, because silence never authorises.
    defaultToNo: true,
    expiresAt: request.expiresAt.toISOString(),
    // Only the scopes that die with the session. Offering `always` before the screen that revokes
    // it exists would be offering something nobody could take back.
    suggestions: [
      { scope: 'once', labelKey: 'permission.scope.once' },
      { scope: 'session', labelKey: 'permission.scope.session' },
    ],
  };
}

/** A request that is already known, as an outcome. */
function outcomeOf(request: PermissionRequest): PermissionOutcome {
  const resolution = request.resolution;

  return resolution === null ? { kind: 'pending', request } : { kind: 'settled', resolution };
}
