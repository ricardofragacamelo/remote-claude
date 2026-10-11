import { PermissionRule, isPersistedPermissionScope } from '@domain/permission';
import type { PermissionDecision } from '@domain/permission';
import { UserId } from '@domain/auth';
import type { permissionRules } from '@infra/database/schema';

type PermissionRuleRow = typeof permissionRules.$inferSelect;
type PermissionRuleInsert = typeof permissionRules.$inferInsert;

/**
 * A value the table's CHECK constraints say cannot be there, and which is.
 *
 * Thrown rather than defaulted: a rule whose decision this build does not understand is a schema
 * ahead of the code, and guessing whether it meant `allow` is the one guess a permission system
 * may not make.
 */
export class UnreadablePermissionRuleRowError extends Error {
  constructor(column: string, value: string) {
    super(
      `permission_rules.${column} holds ${JSON.stringify(value)}, which this build does not know`,
    );
    this.name = 'UnreadablePermissionRuleRowError';
  }
}

function isDecision(value: string): value is PermissionDecision {
  return value === 'allow' || value === 'deny';
}

/**
 * Why a rule still in an engine's grammar reads as switched off: the migration at boot has not read
 * it yet. It answers nothing until it has — failing closed is a question more (plan 28, B-33).
 */
export const UNMIGRATED = 'unmigrated';

/** Translation between the table and the entity. The two change for different reasons. */
export function toEntity(row: PermissionRuleRow): PermissionRule {
  if (!isPersistedPermissionScope(row.scope)) {
    throw new UnreadablePermissionRuleRowError('scope', row.scope);
  }
  if (!isDecision(row.decision)) {
    throw new UnreadablePermissionRuleRowError('decision', row.decision);
  }

  return PermissionRule.restore({
    id: row.id,
    userId: UserId.create(row.userId),
    sessionId: null,
    projectPath: row.projectPath,
    pattern: row.pattern,
    engine: row.engine,
    decision: row.decision,
    scope: row.scope,
    createdAt: row.grantedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    disabledReason: row.grammar === 'native' ? UNMIGRATED : row.disabledReason,
  });
}

/**
 * The row a rule should be written as — always in the canonical grammar, the only one a rule is
 * granted in. `updatedAt` is set here, never left to a trigger.
 */
export function toRow(rule: PermissionRule, now: Date): PermissionRuleInsert {
  const snapshot = rule.snapshot();

  return {
    id: snapshot.id,
    userId: snapshot.userId.value,
    scope: snapshot.scope,
    projectPath: snapshot.projectPath,
    pattern: snapshot.pattern,
    engine: snapshot.engine ?? null,
    grammar: 'canonical',
    disabledReason: snapshot.disabledReason ?? null,
    nativePattern: null,
    decision: snapshot.decision,
    grantedAt: snapshot.createdAt,
    expiresAt: snapshot.expiresAt,
    revokedAt: snapshot.revokedAt,
    updatedAt: now,
  };
}
