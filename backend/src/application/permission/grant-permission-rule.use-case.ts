import {
  PermissionRule,
  PermissionRuleTemplateUnknownError,
  PermissionRuleTooBroadError,
} from '@domain/permission';
import type { Clock, IdGenerator } from '@domain/shared';
import type { RecordAuditEventUseCase } from '@application/audit';
import type { GrantPermissionRuleCommand } from './commands/grant-permission-rule.command';
import type { PermissionSettings } from './permission-settings';
import type { PermissionRuleRepository, RuleGrant } from './ports/permission-rule.repository';
import type { RuleFolderResolver } from './ports/rule-folder-resolver.port';
import { isKnownRuleTemplateId } from './rule-templates';

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
    private readonly folders: RuleFolderResolver,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRulePatternInvalidError} outside the grammar
   * @throws {import('@domain/permission').PermissionRuleExpiryTooLongError} past the ceiling
   * @throws {import('@domain/permission').PermissionRuleExpiryInvalidError} already over
   * @throws {import('@domain/permission').PermissionScopeUnsupportedError} `project` with no project
   * @throws {import('@domain/permission').PermissionRuleToolInteractiveError} a rule for a question
   *   or a plan, which no rule may answer
   * @throws {import('@domain/permission').PermissionRuleTooBroadError} an `allow` reaching further
   *   than its breadth may, without `acknowledgeBroad` — or at all, when it is `unbounded`
   * @throws {PermissionRuleTemplateUnknownError} a `templateId` the catalog does not have (S-36)
   * @throws whatever `RuleFolderResolver` refuses a raw `projectPath` with
   */
  async execute(command: GrantPermissionRuleCommand): Promise<PermissionRule> {
    return (await this.grantWithResult(command)).rule;
  }

  /**
   * {@link execute}, but says whether it created something new — import's summary needs the count,
   * not only the rule ([15 · B-18], S-145).
   *
   * @throws the same as {@link execute}
   */
  async grantWithResult(command: GrantPermissionRuleCommand): Promise<RuleGrant> {
    const at = this.clock.now();

    return this.store(await this.build(command, at), command.userId, at);
  }

  /**
   * Every check {@link execute} runs, without writing anything — import's revalidation pass, right
   * before it writes a single rule ([15 · B-18], S-142): an item accepted at preview that would be
   * refused now fails here, before any of the lot is stored.
   *
   * @throws the same as {@link execute}
   */
  async validate(command: GrantPermissionRuleCommand): Promise<PermissionRule> {
    return this.build(command, this.clock.now());
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
    const drafts: { command: GrantPermissionRuleCommand; rule: PermissionRule }[] = [];

    for (const command of commands) {
      drafts.push({ command, rule: await this.build(command, at) });
    }

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

  /**
   * Step 1: the folder, resolved when it is not trusted already; the domain validates the pattern —
   * in the canonical grammar, the kind read from it —, the lifetime and the scope, and refuses a
   * rule for a question or a plan, which no lookup would ever read as an answer (D-08; plan 28,
   * B-32). Step 2: the breadth, for an `allow` on every route a rule is born from — `POST`, import,
   * restore, a template ([15 · D-09]). Nothing is stored yet.
   */
  private async build(command: GrantPermissionRuleCommand, at: Date): Promise<PermissionRule> {
    if (command.templateId != null && !isKnownRuleTemplateId(command.templateId)) {
      throw new PermissionRuleTemplateUnknownError(command.templateId);
    }

    const projectPath = await this.resolveProjectPath(command);
    const expiresAt = command.expiresAt ?? new Date(at.getTime() + this.defaultLifetimeMs(command));

    const rule = PermissionRule.create(
      {
        id: this.ids.next(),
        userId: command.userId,
        sessionId: null,
        projectPath,
        pattern: command.pattern,
        engine: command.engine ?? null,
        decision: command.decision,
        scope: command.scope,
        createdAt: at,
        expiresAt,
        grantedVia: command.grantedVia,
        grantedFromRequestId: command.grantedFromRequestId ?? null,
        templateId: command.templateId ?? null,
        restoredFrom: command.restoredFrom ?? null,
      },
      this.maxLifetimeMs(command),
    );

    this.confirmBreadth(rule, command);

    return rule;
  }

  /**
   * The card never confronts breadth (S-34): it offers a reach computed from the invocation itself,
   * with no "I accept this is wide" step in its UI, and plan 03's promise — the narrowest pattern
   * that covers what was approved, no second confirmation — stands. Breadth is conferred on every
   * **other** route a rule is born from: `POST`, import, restore, a template (D-09).
   *
   * @throws {PermissionRuleTooBroadError} an `allow` reaching further than its breadth may
   */
  private confirmBreadth(rule: PermissionRule, command: GrantPermissionRuleCommand): void {
    if (command.grantedVia === 'approval' || rule.decision !== 'allow') {
      return;
    }

    const breadth = rule.breadth;

    if (breadth === 'narrow' || (breadth === 'broad' && command.acknowledgeBroad === true)) {
      return;
    }

    throw new PermissionRuleTooBroadError(breadth as NonNullable<typeof breadth>);
  }

  /**
   * `project` not already trusted is resolved against the allowlist before anything else runs — a
   * pasta that is not the caller's own, does not exist, or is not a directory never reaches the
   * pattern or breadth checks ([15 · D-10], S-22…S-28).
   */
  private async resolveProjectPath(command: GrantPermissionRuleCommand): Promise<string | null> {
    if (command.scope !== 'project' || command.projectPath === null) {
      return null;
    }

    if ('trusted' in command.projectPath) {
      return command.projectPath.trusted;
    }

    return (await this.folders.resolve(command.projectPath.raw, command.userId)).value;
  }

  private defaultLifetimeMs(command: GrantPermissionRuleCommand): number {
    return command.decision === 'deny'
      ? this.settings.ruleDenyDefaultLifetimeMs
      : this.settings.ruleDefaultLifetimeMs;
  }

  private maxLifetimeMs(command: GrantPermissionRuleCommand): number {
    return command.decision === 'deny'
      ? this.settings.ruleDenyMaxLifetimeMs
      : this.settings.ruleMaxLifetimeMs;
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
