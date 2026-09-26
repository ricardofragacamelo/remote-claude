import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { PermissionRuleRepository, RuleGrant, RuleRevocation } from '@application/permission';
import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { permissionRules } from '@infra/database/schema';
import { describedBy, runLogged } from '../query-logging';
import { toEntity, toRow } from './permission-rule.mapper';

/**
 * `permission_rules`, in PostgreSQL.
 *
 * Every read that can answer a request is scoped by user and by the clock, in the predicate: a
 * lookup that could be written without the owner is the one that lets one person's rule answer
 * another's request (D-03), and one without `expires_at` is the one that lets an expired rule go
 * on answering.
 */
@Injectable()
export class DrizzlePermissionRuleRepository implements PermissionRuleRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  /**
   * One transaction, behind an advisory lock keyed on what makes two rules the same.
   *
   * A unique index cannot say "one **active** rule": whether a row is active depends on the
   * clock, and an index cannot read it. The lock is transaction-scoped, so it is released by the
   * commit or the rollback and never outlives the grant — and two clients granting the same rule
   * at the same moment end up with one row, because the second one reads the first one's.
   */
  async grant(rule: PermissionRule, now: Date): Promise<RuleGrant> {
    // JSON rather than a separator: no character is safe to join on when one of the parts is a
    // command line somebody typed, and PostgreSQL text refuses the NUL that would otherwise be.
    const key = JSON.stringify([
      rule.userId.value,
      rule.scope,
      rule.projectPath,
      rule.ruleContent,
      rule.decision,
    ]);

    return this.context.db.transaction(async (tx) => {
      await runLogged(
        this.context.logger,
        'permissionRule.lock',
        describedBy(tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)),
      );

      const existing = await runLogged(
        this.context.logger,
        'permissionRule.findEquivalent',
        tx
          .select()
          .from(permissionRules)
          .where(
            and(
              eq(permissionRules.userId, rule.userId.value),
              eq(permissionRules.scope, rule.scope),
              rule.projectPath === null
                ? isNull(permissionRules.projectPath)
                : eq(permissionRules.projectPath, rule.projectPath),
              eq(permissionRules.pattern, rule.ruleContent),
              eq(permissionRules.decision, rule.decision),
              isNull(permissionRules.revokedAt),
              gt(permissionRules.expiresAt, now),
            ),
          )
          .limit(1),
      );

      const found = existing[0];
      if (found !== undefined) {
        return { rule: toEntity(found), created: false };
      }

      await runLogged(
        this.context.logger,
        'permissionRule.insert',
        tx.insert(permissionRules).values(toRow(rule, now)),
      );

      return { rule, created: true };
    });
  }

  /** By id alone, and on purpose: telling "not there" from "not yours" is the caller's job. */
  async findById(ruleId: string): Promise<PermissionRule | null> {
    const [row] = await runLogged(
      this.context.logger,
      'permissionRule.findById',
      this.context.db.select().from(permissionRules).where(eq(permissionRules.id, ruleId)).limit(1),
    );

    return row === undefined ? null : toEntity(row);
  }

  async findApplicable(
    userId: UserId,
    projectPath: string | null,
    now: Date,
  ): Promise<PermissionRule[]> {
    // `always` reaches every request; `project` only the one from that workspace root. A request
    // with no known project is reached by `always` alone.
    const reach: SQL | undefined =
      projectPath === null
        ? eq(permissionRules.scope, 'always')
        : or(
            eq(permissionRules.scope, 'always'),
            and(eq(permissionRules.scope, 'project'), eq(permissionRules.projectPath, projectPath)),
          );

    const rows = await runLogged(
      this.context.logger,
      'permissionRule.findApplicable',
      this.context.db
        .select()
        .from(permissionRules)
        .where(
          and(
            eq(permissionRules.userId, userId.value),
            inArray(permissionRules.scope, ['project', 'always']),
            isNull(permissionRules.revokedAt),
            gt(permissionRules.expiresAt, now),
            reach,
          ),
        )
        .orderBy(desc(permissionRules.grantedAt)),
    );

    return rows.map(toEntity);
  }

  async listFor(userId: UserId): Promise<PermissionRule[]> {
    const rows = await runLogged(
      this.context.logger,
      'permissionRule.listFor',
      this.context.db
        .select()
        .from(permissionRules)
        .where(and(eq(permissionRules.userId, userId.value), isNull(permissionRules.revokedAt)))
        .orderBy(desc(permissionRules.grantedAt), desc(permissionRules.id)),
    );

    return rows.map(toEntity);
  }

  async saveRevocation(rule: PermissionRule): Promise<RuleRevocation> {
    // `revoked_at IS NULL` in the predicate: the first revocation is the one the row keeps, and a
    // second writer racing it changes nothing. PostgreSQL re-reads the predicate on the row the
    // first writer committed, so the loser matches no row — and reads back what the winner wrote.
    const [won] = await runLogged(
      this.context.logger,
      'permissionRule.revoke',
      this.context.db
        .update(permissionRules)
        .set({ revokedAt: rule.revokedAt, updatedAt: this.context.clock.now() })
        .where(and(eq(permissionRules.id, rule.id), isNull(permissionRules.revokedAt)))
        .returning(),
    );

    if (won !== undefined) {
      return { rule: toEntity(won), revoked: true };
    }

    return { rule: (await this.findById(rule.id)) ?? rule, revoked: false };
  }
}
