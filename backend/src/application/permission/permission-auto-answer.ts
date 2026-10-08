import { answeredByMode } from '@domain/permission';
import type { PermissionRequest } from '@domain/permission';
import type { PermissionMode } from '@domain/session';
import type { PermissionRuleBook } from './permission-rule-book';
import type { PermissionSettlement } from './settle-permission';

/**
 * What a shell refusal says to Claude when a rule is what refused it.
 *
 * English and technical on purpose: it is not shown to a person, it is handed to the model so it
 * can propose something else instead of retrying the same command. The prose a human reads comes
 * from a `messageKey`, and this is not that.
 */
const DENIED_BY_RULE = 'denied by a permission rule the user granted earlier';

/**
 * Answering a request without putting it to anybody — by a rule, or by Permitir tudo.
 *
 * A collaborator rather than a step of one use case, because two callers need exactly this: a
 * question arriving, and a session switching to Permitir tudo with questions already on screen
 * ([23 · D-06](../../../../docs/plans/23-fluid-permissions/decisions.md)). Written twice, the second
 * copy is the one that forgets the rules come first.
 *
 * The order is the whole rule ([ADR-022](../../../../docs/architecture/shared/00-decisions.md)):
 *
 * 1. **the rules.** A `deny` refuses and an `allow` answers as a rule, whatever the mode;
 * 2. **the mode**, and only when the rules were read and none matched. A lookup that failed asks a
 *    human: a `deny` nobody read cannot be traded for an automatic yes;
 * 3. otherwise nothing is answered, and the caller asks.
 *
 * Either answer is **announced**: there is no card and no push, but there is a `permission.resolved`
 * with `auto: true` and a `via` for every screen watching. An authorisation given in advance has to
 * be visible when it acts.
 */
export class PermissionAutoAnswer {
  constructor(
    private readonly rules: PermissionRuleBook,
    private readonly settlement: PermissionSettlement,
  ) {}

  /** @returns whether the request is settled now — by this call, or by somebody meanwhile */
  async tryAnswer(request: PermissionRequest, mode: PermissionMode, now: Date): Promise<boolean> {
    const lookup = await this.rules.lookup(request.id, {
      subject: {
        userId: request.userId,
        sessionId: request.sessionId,
        projectPath: request.projectPath,
      },
      toolName: request.toolName,
      input: request.input,
      permissionMode: mode,
      now,
    });

    // Reading the rules is a wait, and the request was already in the registry: something may have
    // settled it meanwhile. An answer it already has is the outcome.
    if (!request.isPending) {
      return true;
    }

    if (lookup.kind === 'rule') {
      const { rule } = lookup;

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
          via: 'rule',
          at: now,
        },
        { announce: true },
      );

      return true;
    }

    if (lookup.kind === 'none' && answeredByMode(mode, request.toolName)) {
      // The owner is the author: they switched the mode on, and the record says so. `once`,
      // because the mode leaves no rule behind — switching it off stops it at the next tool.
      await this.settlement.settle(
        request,
        {
          decision: 'allow',
          reason: null,
          scope: 'once',
          resolvedBy: request.userId,
          resolvedFrom: null,
          auto: true,
          via: 'allowAll',
          at: now,
        },
        { announce: true },
      );

      return true;
    }

    return false;
  }
}
