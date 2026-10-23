import type { PermissionRule, RulePattern } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type { RecordAuditEventUseCase } from '@application/audit';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';

/** Whether [pattern] names [serverName], exactly (`mcp(srv:tool)`) or by prefix (`mcp(srv:*)`). */
function reachesServer(pattern: RulePattern, serverName: string): boolean {
  if (pattern.kind !== 'mcp') {
    return false;
  }
  return pattern.reach === 'prefix'
    ? pattern.content === serverName
    : pattern.content.startsWith(`${serverName}:`);
}

/**
 * Taking back every `allow` rule of [userId] that reaches [serverName] — `mcp(serverName:…)`, by
 * tool or by the whole server — because what the server runs changed, or it is gone (plan 13, B-26;
 * D-12). A rule granted to a program is a rule about *that* program: the moment the server's
 * command, args, URL or transport changes, or it is removed, the same name could answer to a
 * different one, and a rule that still said yes would be trusting a program nobody evaluated.
 *
 * `deny` holds — restricting never authorises a different program, so there is nothing about a
 * `deny` rule that a changed server could turn into a mistake. Only `allow` is ever revoked here.
 *
 * Matched here, in the core, never by the engine's dialect (plan 28, D-11): the canonical pattern
 * already names the server and the tool, and a server's identity does not depend on which engine
 * happens to run it.
 */
export class RevokeMcpServerRulesUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly trail: RecordAuditEventUseCase,
    private readonly clock: Clock,
  ) {}

  /** Every rule this call actually revoked — what a second step would list before the change. */
  async execute(
    userId: UserId,
    engine: string,
    serverName: string,
  ): Promise<readonly PermissionRule[]> {
    const at = this.clock.now();
    const all = await this.rules.listFor(userId);
    const revoked: PermissionRule[] = [];

    for (const rule of all) {
      if (!this.reaches(rule, engine, serverName, at)) {
        continue;
      }

      const taken = rule.revoke(at);
      if (taken === rule) {
        continue;
      }

      const stored = await this.rules.saveRevocation(taken);
      if (!stored.revoked) {
        continue;
      }

      await this.trail.execute({
        userId,
        kind: 'permission.ruleRevoked',
        subjectId: taken.id,
        subjectLabel: taken.ruleContent,
        at,
      });
      revoked.push(stored.rule);
    }

    return revoked;
  }

  /**
   * The content of every rule {@link execute} would revoke right now, were it called — read-only,
   * never touches the database (plan 13, B-28, D-62, D-79): the second step of editing a server
   * shows this before anything is saved, the part of D-12 that `PreviewMcpServerUseCase` left
   * unbuilt until a screen actually needed the list (D-62). The exact same match as {@link
   * execute}, minus the write — a rule this lists and a rule `execute` would then actually revoke
   * can only ever disagree if something else revoked or expired it in between the two calls, the
   * same race any preview-then-confirm flow already lives with (S-68).
   */
  async preview(userId: UserId, engine: string, serverName: string): Promise<readonly string[]> {
    const at = this.clock.now();
    const all = await this.rules.listFor(userId);
    return all
      .filter((rule) => this.reaches(rule, engine, serverName, at))
      .map((rule) => rule.ruleContent);
  }

  private reaches(rule: PermissionRule, engine: string, serverName: string, at: Date): boolean {
    return (
      rule.decision === 'allow' &&
      rule.pattern !== null &&
      (rule.engine === null || rule.engine === engine) &&
      rule.isActiveAt(at) &&
      reachesServer(rule.pattern, serverName)
    );
  }
}
