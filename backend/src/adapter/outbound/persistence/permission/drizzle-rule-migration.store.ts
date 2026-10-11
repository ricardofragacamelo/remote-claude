import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import type { NativeRule, RuleMigrationStore } from '@application/permission';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { permissionRules } from '@infra/database/schema';
import { runLogged } from '../query-logging';

/**
 * `permission_rules`, as the migration of plan 28 · B-33 reads and rewrites the rules still in an
 * engine's grammar.
 *
 * Every write is guarded by `grammar = 'native'` in its predicate: the first writer converts the
 * rule and the second matches no row — which is what makes the migration safe to run twice, or from
 * two processes at once (S-134).
 */
@Injectable()
export class DrizzleRuleMigrationStore implements RuleMigrationStore {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async nativeRules(now: Date): Promise<NativeRule[]> {
    const rows = await runLogged(
      this.context.logger,
      'permissionRule.native',
      this.context.db
        .select({
          id: permissionRules.id,
          pattern: permissionRules.pattern,
          engine: permissionRules.engine,
          revokedAt: permissionRules.revokedAt,
          expiresAt: permissionRules.expiresAt,
        })
        .from(permissionRules)
        .where(eq(permissionRules.grammar, 'native'))
        .orderBy(asc(permissionRules.grantedAt), asc(permissionRules.id)),
    );

    return rows.map((row) => ({
      id: row.id,
      pattern: row.pattern,
      engine: row.engine,
      active: row.revokedAt === null && row.expiresAt.getTime() > now.getTime(),
    }));
  }

  convert(ruleId: string, pattern: string): Promise<boolean> {
    return this.rewrite('permissionRule.convert', ruleId, { pattern });
  }

  disable(ruleId: string, reason: string): Promise<boolean> {
    return this.rewrite('permissionRule.disable', ruleId, { disabledReason: reason });
  }

  /**
   * Marks a rule still `native` as read, with [change], keeping the pattern it was written with —
   * read in the same statement that may replace it.
   */
  private async rewrite(
    op: string,
    ruleId: string,
    change: { readonly pattern?: string; readonly disabledReason?: string },
  ): Promise<boolean> {
    const rows = await runLogged(
      this.context.logger,
      op,
      this.context.db
        .update(permissionRules)
        .set({
          ...change,
          nativePattern: sql`${permissionRules.pattern}`,
          grammar: 'canonical',
          updatedAt: this.context.clock.now(),
        })
        .where(and(eq(permissionRules.id, ruleId), eq(permissionRules.grammar, 'native')))
        .returning({ id: permissionRules.id }),
    );

    return rows.length > 0;
  }
}
