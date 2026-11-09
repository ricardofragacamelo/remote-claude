import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzlePermissionRuleRepository } from '@adapter/outbound/persistence/permission/drizzle-permission-rule.repository';
import { UserId } from '@domain/auth';
import { PermissionRule } from '@domain/permission';
import { decodeRuleCursor, EMPTY_PERMISSION_RULE_FILTER } from '@application/permission';
import type { PermissionRuleSortField } from '@application/permission';
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
 * The Drizzle repository, against a real PostgreSQL — plan 03, S-46; plan 15, B-10.
 *
 * Against a real one because what these suites prove is the database's own behaviour: the
 * predicate re-read on the row a racing `UPDATE` just committed, and the row-tuple comparison
 * that keeps keyset pagination stable — neither is something an in-memory fake can demonstrate.
 */
describe('the permission rule repository', () => {
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

  const aRule = (
    id: string,
    overrides: Partial<Parameters<typeof PermissionRule.create>[0]> = {},
    maxLifetimeMs = HOUR,
  ): PermissionRule =>
    PermissionRule.create(
      {
        id,
        userId: owner,
        sessionId: null,
        projectPath: null,
        pattern: 'file.write(/workspace/summary.md)',
        decision: 'allow',
        scope: 'always',
        createdAt: grantedAt,
        expiresAt: new Date(grantedAt.getTime() + HOUR),
        ...overrides,
      },
      maxLifetimeMs,
    );

  describe('revoking a stored rule', () => {
    it('keeps the first revocation, and tells the second it wrote nothing — S-46', async () => {
      const rule = (await repository().grant(aRule('01J0RULE00000000000000001'), grantedAt)).rule;
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
      const rule = (await repository().grant(aRule('01J0RULE00000000000000002'), grantedAt)).rule;

      const outcomes = await Promise.all([
        repository().saveRevocation(rule.revoke(new Date(grantedAt.getTime() + 1_000))),
        repository().saveRevocation(rule.revoke(new Date(grantedAt.getTime() + 2_000))),
      ]);

      expect(outcomes.filter((outcome) => outcome.revoked)).toHaveLength(1);
      // Both are told the same instant: the one the row kept.
      expect(outcomes[0]?.rule.revokedAt).toEqual(outcomes[1]?.rule.revokedAt);
    });

    it('writes nothing for a rule it never stored, and says so', async () => {
      const neverStored = aRule('01J0RULE0000000000000NONE').revoke(grantedAt);

      expect(await repository().saveRevocation(neverStored)).toEqual({
        rule: neverStored,
        revoked: false,
      });
      expect(await repository().findById(neverStored.id)).toBeNull();
    });
  });

  describe('listing a page — plan 15, B-10', () => {
    const pageOf = (
      sort: PermissionRuleSortField,
      order: 'asc' | 'desc',
      cursorFrom: string | null,
    ) =>
      repository().listPage({
        userId: owner,
        filter: EMPTY_PERMISSION_RULE_FILTER,
        sort,
        order,
        cursor: cursorFrom === null ? null : decodeRuleCursor(cursorFrom),
        pageSize: 2,
        now: new Date(grantedAt.getTime() + HOUR / 2),
      });

    it('refuses to sort by lastUsedAt or useCount — those live in the trail, not here', async () => {
      await repository().grant(aRule('01J0RULE00000000000000010'), grantedAt);

      await expect(pageOf('lastUsedAt', 'desc', null)).rejects.toThrow(
        'does not sort by lastUsedAt',
      );
      await expect(pageOf('useCount', 'desc', null)).rejects.toThrow('does not sort by useCount');
    });

    it('paginates ascending by pattern, past the cursor, to the last row', async () => {
      await repository().grant(
        aRule('01J0RULE00000000000000020', { pattern: 'shell(aaa)' }),
        grantedAt,
      );
      await repository().grant(
        aRule('01J0RULE00000000000000021', { pattern: 'shell(bbb)' }),
        grantedAt,
      );
      await repository().grant(
        aRule('01J0RULE00000000000000022', { pattern: 'shell(ccc)' }),
        grantedAt,
      );

      const first = await pageOf('pattern', 'asc', null);
      expect(first.items.map((rule) => rule.ruleContent)).toEqual(['shell(aaa)', 'shell(bbb)']);
      expect(first.nextCursor).not.toBeNull();

      const second = await pageOf('pattern', 'asc', first.nextCursor);
      expect(second.items.map((rule) => rule.ruleContent)).toEqual(['shell(ccc)']);
      expect(second.nextCursor).toBeNull();
    });

    it('paginates ascending by expiresAt, past the cursor, to the last row', async () => {
      await repository().grant(
        aRule(
          '01J0RULE00000000000000030',
          {
            pattern: 'file.write(/workspace/a.md)',
            expiresAt: new Date(grantedAt.getTime() + HOUR),
          },
          4 * HOUR,
        ),
        grantedAt,
      );
      await repository().grant(
        aRule(
          '01J0RULE00000000000000031',
          {
            pattern: 'file.write(/workspace/b.md)',
            expiresAt: new Date(grantedAt.getTime() + 2 * HOUR),
          },
          4 * HOUR,
        ),
        grantedAt,
      );
      await repository().grant(
        aRule(
          '01J0RULE00000000000000032',
          {
            pattern: 'file.write(/workspace/c.md)',
            expiresAt: new Date(grantedAt.getTime() + 3 * HOUR),
          },
          4 * HOUR,
        ),
        grantedAt,
      );

      const first = await pageOf('expiresAt', 'asc', null);
      expect(first.items.map((rule) => rule.id)).toEqual([
        '01J0RULE00000000000000030',
        '01J0RULE00000000000000031',
      ]);

      const second = await pageOf('expiresAt', 'asc', first.nextCursor);
      expect(second.items.map((rule) => rule.id)).toEqual(['01J0RULE00000000000000032']);
    });

    it('summarizes an unfiltered empty set as all zeroes — the aggregate always returns one row', async () => {
      const summary = await repository().summarize(owner, EMPTY_PERMISSION_RULE_FILTER, grantedAt);

      expect(summary.byStatus).toEqual({ active: 0, expired: 0, revoked: 0, disabled: 0 });
    });
  });
});
