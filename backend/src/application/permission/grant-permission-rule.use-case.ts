import { PermissionRule } from '@domain/permission';
import type { Clock, IdGenerator } from '@domain/shared';
import type { RecordAuditEventUseCase } from '@application/audit';
import type { GrantPermissionRuleCommand } from './commands/grant-permission-rule.command';
import type { PermissionSettings } from './permission-settings';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/**
 * Granting a rule that outlives the session.
 *
 * One routine for both ways a rule is born — a person choosing `project` or `always` on a card,
 * and the rules API — because the second implementation is the one that ages differently
 * ([D-10](../../../../docs/plans/03-rules-and-audit/decisions.md)). Three things happen, in this
 * order:
 *
 * 1. **the domain validates** the pattern, the lifetime and the scope — before anything is stored;
 * 2. **the repository grants atomically**, handing back the equivalent rule when one is already
 *    active, so asking twice is one rule (S-10);
 * 3. **the trail records** the grant, and only a grant that created something. A failure there
 *    fails the call **and revokes the rule it created**: an authorisation given in advance that
 *    nobody can account for afterwards is the worse of the two outcomes.
 */
export class GrantPermissionRuleUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly trail: RecordAuditEventUseCase,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly settings: PermissionSettings,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRulePatternInvalidError} outside the grammar
   * @throws {import('@domain/permission').PermissionRuleExpiryTooLongError} past the ceiling
   * @throws {import('@domain/permission').PermissionRuleExpiryInvalidError} already over
   * @throws {import('@domain/permission').PermissionScopeUnsupportedError} `project` with no project
   */
  async execute(command: GrantPermissionRuleCommand): Promise<PermissionRule> {
    const at = this.clock.now();
    const { rule } = await this.store(this.build(command, at), command.userId, at);

    return rule;
  }

  /**
   * Several rules from one answer — the `prefix` reach of a line of several commands (plan 23,
   * D-13). **All or none**, as far as this answer goes: every pattern is validated before any is
   * stored, and when storing one fails, the rules this call created are taken back — with the trail
   * saying so — before the failure goes up. A rule that already existed is left alone: it was
   * somebody's before this answer.
   *
   * @throws the same as {@link execute}, for any of them
   */
  async executeAll(commands: readonly GrantPermissionRuleCommand[]): Promise<PermissionRule[]> {
    const at = this.clock.now();
    const drafts = commands.map((command) => ({ command, rule: this.build(command, at) }));
    const stored: PermissionRule[] = [];
    const created: { rule: PermissionRule; command: GrantPermissionRuleCommand }[] = [];

    try {
      for (const { command, rule } of drafts) {
        const grant = await this.store(rule, command.userId, at);
        stored.push(grant.rule);

        if (grant.created) {
          created.push({ rule: grant.rule, command });
        }
      }
    } catch (error) {
      for (const { rule, command } of created) {
        await this.rules.saveRevocation(rule.revoke(at));
        await this.trail.execute({
          userId: command.userId,
          kind: 'permission.ruleRevoked',
          subjectId: rule.id,
          subjectLabel: rule.ruleContent,
          at,
        });
      }
      throw error;
    }

    return stored;
  }

  /** Step 1: the domain validates the pattern, the lifetime and the scope. Nothing is stored. */
  private build(command: GrantPermissionRuleCommand, at: Date): PermissionRule {
    return PermissionRule.create(
      {
        id: this.ids.next(),
        userId: command.userId,
        sessionId: null,
        projectPath: command.scope === 'project' ? command.projectPath : null,
        pattern: command.pattern,
        decision: command.decision,
        scope: command.scope,
        createdAt: at,
        expiresAt:
          command.expiresAt ?? new Date(at.getTime() + this.settings.ruleDefaultLifetimeMs),
      },
      this.settings.ruleMaxLifetimeMs,
    );
  }

  /** Steps 2 and 3: the atomic grant, and the trail of a grant that created something. */
  private async store(
    rule: PermissionRule,
    userId: GrantPermissionRuleCommand['userId'],
    at: Date,
  ): Promise<{ rule: PermissionRule; created: boolean }> {
    const grant = await this.rules.grant(rule, at);

    if (grant.created) {
      try {
        await this.trail.execute({
          userId,
          kind: 'permission.ruleGranted',
          subjectId: grant.rule.id,
          subjectLabel: grant.rule.ruleContent,
          at,
        });
      } catch (error) {
        // The rule is taken back before the failure goes up. Left standing, it would be exactly
        // what the trail exists to prevent: an authorisation that answers requests and that
        // nobody can account for. Revoked, it never shows in the list and never answers again.
        await this.rules.saveRevocation(grant.rule.revoke(at));
        throw error;
      }
    }

    return grant;
  }
}
