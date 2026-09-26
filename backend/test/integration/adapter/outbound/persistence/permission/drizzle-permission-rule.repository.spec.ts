import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzlePermissionRuleRepository } from '@adapter/outbound/persistence/permission/drizzle-permission-rule.repository';
import { UserId } from '@domain/auth';
import { PermissionRule } from '@domain/permission';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';

const owner = UserId.create('auth|owner');
const grantedAt = new Date('2026-09-18T12:00:00.000Z');
const HOUR = 3_600_000;

/**
 * Revoking, against a real PostgreSQL — plan 03, S-46.
 *
 * Against a real one because the property under test is the database's: two revocations that both
 * read the rule as active race to one row, and only the predicate of the `UPDATE`, re-read by
 * PostgreSQL on the row the first writer committed, decides which of them is the revocation. No
 * in-memory stand-in re-reads a predicate.
 */
describe('revoking a stored rule', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    await migrate(connection.pool);
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  afterEach(async () => {
    await connection.db.execute(sql`TRUNCATE TABLE "permission_rules"`);
  });

  const repository = (): DrizzlePermissionRuleRepository =>
    new DrizzlePermissionRuleRepository(aPersistenceContext(connection.db));

  const anAlwaysRule = (id = '01J0RULE00000000000000001'): PermissionRule =>
    PermissionRule.create(
      {
        id,
        userId: owner,
        sessionId: null,
        projectPath: null,
        pattern: 'Write(/workspace/summary.md)',
        decision: 'allow',
        scope: 'always',
        createdAt: grantedAt,
        expiresAt: new Date(grantedAt.getTime() + HOUR),
      },
      HOUR,
    );

  it('keeps the first revocation, and tells the second it wrote nothing — S-46', async () => {
    const rule = (await repository().grant(anAlwaysRule(), grantedAt)).rule;
    const first = rule.revoke(new Date(grantedAt.getTime() + 1_000));
    const second = rule.revoke(new Date(grantedAt.getTime() + 2_000));

    const won = await repository().saveRevocation(first);
    const lost = await repository().saveRevocation(second);

    expect(won).toEqual({ rule: first, revoked: true });
    // The loser is handed the revocation the row keeps, not the one it tried to write.
    expect(lost.revoked).toBe(false);
    expect(lost.rule.revokedAt).toEqual(first.revokedAt);
    expect((await repository().findById(rule.id))?.revokedAt).toEqual(first.revokedAt);
  });

  it('lets exactly one of two simultaneous revocations win — S-46', async () => {
    const rule = (await repository().grant(anAlwaysRule(), grantedAt)).rule;

    const outcomes = await Promise.all([
      repository().saveRevocation(rule.revoke(new Date(grantedAt.getTime() + 1_000))),
      repository().saveRevocation(rule.revoke(new Date(grantedAt.getTime() + 2_000))),
    ]);

    expect(outcomes.filter((outcome) => outcome.revoked)).toHaveLength(1);
    // Both are told the same instant: the one the row kept.
    expect(outcomes[0]?.rule.revokedAt).toEqual(outcomes[1]?.rule.revokedAt);
  });

  it('writes nothing for a rule it never stored, and says so', async () => {
    const neverStored = anAlwaysRule('01J0RULE0000000000000NONE').revoke(grantedAt);

    expect(await repository().saveRevocation(neverStored)).toEqual({
      rule: neverStored,
      revoked: false,
    });
    expect(await repository().findById(neverStored.id)).toBeNull();
  });
});
