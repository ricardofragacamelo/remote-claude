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
