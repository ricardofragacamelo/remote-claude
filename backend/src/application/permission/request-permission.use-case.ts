import { PermissionRequest, classifyRisk } from '@domain/permission';
import type { PermissionResolution } from '@domain/permission';
import type { SessionId } from '@domain/session';
import type { Clock } from '@domain/shared';
import type { RequestPermissionCommand } from './commands/request-permission.command';
import type { PermissionBroadcaster } from './ports/permission-broadcaster.port';
import type { PermissionEvents } from './ports/permission-events.port';
import type { PermissionRequestRepository } from './ports/permission-request.repository';
import { requestedPayload } from './permission-payloads';
import type { PermissionDeadlines } from './permission-deadlines';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionRuleBook } from './permission-rule-book';
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
const DENIED_BY_RULE = 'denied by a permission rule the user granted earlier';

/**
 * The four steps `canUseTool` takes, in the one order that is safe.
 *
 * 1. **idempotency.** The SDK redelivers a pending call after a transport gap, and a request id it
 *    has seen before gets the answer it already has — never a second question and never a second
 *    execution;
 * 2. **a rule answers without disturbing anybody.** Somebody who said "for this session", "in this
 *    project" or "always" is not asked again, and no push goes out. What **is** published is the
 *    resolution, with `auto: true`: the person has to be able to see that something was
 *    authorised in their name. The rules are read on every request, so a revoked one stops
 *    answering at once — in a session that is already running, too;
 * 3. **the question is recorded and published**, in that order, so a request nobody can account
 *    for afterwards cannot reach a screen;
 * 4. **the deadline is armed**, and only then is the fact published for whoever is not looking.
 *    It is the only deadline there is.
 *
 * What it does **not** do is wait. Waiting belongs to the session runtime, which is holding the
 * SDK's promise — this returns what is known now, and the loop is released by the resolution
 * event ([backend/03](../../../../docs/architecture/backend/03-modules.md#comunicação-assíncrona)).
 */
export class RequestPermissionUseCase {
  constructor(
    private readonly registry: PermissionRegistry,
    private readonly requests: PermissionRequestRepository,
    private readonly rules: PermissionRuleBook,
    private readonly settlement: PermissionSettlement,
    private readonly deadlines: PermissionDeadlines,
    private readonly broadcaster: PermissionBroadcaster,
    private readonly events: PermissionEvents,
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
      projectPath: command.projectPath,
      toolUseId: command.toolUseId,
      toolName: command.toolName,
      input: command.input,
      riskHint: classifyRisk(command.toolName, command.input),
      requestedAt: now,
      expiresAt: new Date(now.getTime() + this.settings.timeoutMs),
    });

    this.registry.add(request);
    await this.requests.open(request);

    const rule = await this.rules.answering(request.id, {
      subject: {
        userId: command.userId,
        sessionId: command.sessionId,
        projectPath: command.projectPath,
      },
      toolName: command.toolName,
      input: command.input,
      permissionMode: command.permissionMode,
      now,
    });

    // Reading the rules is the one wait between recording the question and asking it, and the
    // request is already in the registry by then — so something may have settled it meanwhile.
    // Asking a question that is already answered would arm a deadline over it and put a dead card
    // on screen; the answer it already has is the outcome.
    if (!request.isPending) {
      return outcomeOf(request);
    }

    if (rule !== null) {
      // Announced, and never asked: there is no card and no push, but there is a
      // `permission.resolved` with `auto: true` for every screen watching. A rule is an
      // authorisation given in advance, and the person it acts for has to be able to see it act.
      await this.settlement.settle(
        request,
        {
          decision: rule.decision,
          reason: rule.decision === 'deny' ? DENIED_BY_RULE : null,
          scope: rule.scope,
          resolvedBy: rule.userId,
          resolvedFrom: null,
          auto: true,
          ruleId: rule.id,
          at: now,
        },
        { announce: true },
      );

      return outcomeOf(request);
    }

    this.deadlines.arm(request);
    this.broadcaster.request(request.sessionId, {
      type: 'permission.requested',
      payload: requestedPayload(request, this.settings.ruleDefaultLifetimeMs),
    });

    // **After** the card, and that ordering is the whole difference between the two channels:
    // whoever has the screen open has already been asked, and the push exists for whoever has
    // not. Publication never throws, so nothing here can hold the agent loop open.
    this.events.requested({ request });

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
    return this.registry
      .pendingFor(sessionId)
      .map((request) => requestedPayload(request, this.settings.ruleDefaultLifetimeMs));
  }
}

/** A request that is already known, as an outcome. */
function outcomeOf(request: PermissionRequest): PermissionOutcome {
  const resolution = request.resolution;

  return resolution === null ? { kind: 'pending', request } : { kind: 'settled', resolution };
}
