import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleAuditRepository } from '@adapter/outbound/persistence/audit/drizzle-audit.repository';
import { AuditEntry } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const owner = UserId.create('auth|owner');
const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const at = new Date('2026-09-18T12:00:00.000Z');

/**
 * The trail, against a real PostgreSQL.
 *
 * Against a real one because the guarantee under test is the **database's**: the triggers are what
 * make append-only a property of the storage rather than a promise of the code, and no in-memory
 * stand-in has them.
 */
describe('the audit trail', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let log: RecordingLogger;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    await migrate(connection.pool);
    log = new RecordingLogger();
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  afterEach(async () => {
    // The trigger refuses a DELETE inside the retention floor, so a test's own rows cannot be
    // removed the ordinary way. Disabling the trigger for the truncate is the suite admitting
    // that it is the owner of this database — and it is the same power the decision accepted
    // when it chose a trigger over a restricted role.
    await connection.db.execute(sql`ALTER TABLE "audit_entries" DISABLE TRIGGER USER`);
    await connection.db.execute(sql`TRUNCATE TABLE "audit_entries"`);
    await connection.db.execute(sql`ALTER TABLE "audit_entries" ENABLE TRIGGER USER`);
    log = new RecordingLogger();
  });

  const repository = (): DrizzleAuditRepository =>
    new DrizzleAuditRepository(aPersistenceContext(connection.db, { logger: log.logger }));

  const entry = (
    overrides: { id?: string; toolUseId?: string; toolName?: string; at?: Date } = {},
  ): AuditEntry =>
    AuditEntry.record({
      id: overrides.id ?? '01J0AUDIT0000000000000001',
      userId: owner,
      sessionId,
      // Distinct by default: the trail is idempotent per `tool_use_id`, so two entries that share
      // one are one invocation delivered twice, which is a different test from this one.
      toolUseId: overrides.toolUseId ?? `tu-${overrides.id ?? 'default'}`,
      toolName: overrides.toolName ?? 'Bash',
      input: { command: 'git status' },
      decision: 'recorded',
      origin: { deviceId: 'device-1', ip: '10.0.0.2' },
      at: overrides.at ?? at,
    });

  /**
   * What the database said when it refused a statement.
   *
   * Drizzle wraps a failed query in its own error and puts the driver's message on `cause`, so
   * asserting on the outer message would only ever see "Failed query" — and would pass just as
   * happily if the statement had failed for a syntax error instead of the trigger.
   */
  async function refusalOf(statement: Promise<unknown>): Promise<string> {
    try {
      await statement;
    } catch (error) {
      const cause = (error as { cause?: unknown }).cause;
      return String((cause as Error | undefined)?.message ?? (error as Error).message);
    }

    throw new Error('the statement was expected to be refused and was not');
  }

  /** Two invocations that really are two: different ids, different tool use ids. */
  const concurrent = (id: string, toolUseId: string, toolName: string): AuditEntry =>
    AuditEntry.record({
      id,
      userId: owner,
      sessionId,
      toolUseId,
      toolName,
      input: {},
      decision: 'recorded',
      origin: { deviceId: null, ip: null },
      at,
    });

  /** Every row, as the database holds it. */
  async function rows(): Promise<Record<string, unknown>[]> {
    const result = await connection.db.execute<Record<string, unknown>>(
      sql`SELECT * FROM "audit_entries" ORDER BY "seq"`,
    );
    return result.rows;
  }

  it('writes an entry with everything it carries', async () => {
    await repository().append(entry({ toolUseId: 'tu-1' }));

    expect((await rows())[0]).toMatchObject({
      user_id: 'auth|owner',
      session_id: sessionId.value,
      tool_use_id: 'tu-1',
      tool_name: 'Bash',
      input: { command: 'git status' },
      decision: 'recorded',
      device_id: 'device-1',
      ip: '10.0.0.2',
    });
  });

  it('gives each entry a sequence of its own, in the order they were written', async () => {
    await repository().append(entry({ id: '01J0AUDIT0000000000000001' }));
    await repository().append(entry({ id: '01J0AUDIT0000000000000002' }));

    // Strictly increasing rather than exactly [1, 2]: the identity is the table's and does not
    // restart when a test truncates. What `seq` promises is an order, not a count — `at` filters
    // and `seq` orders, because two entries land in the same millisecond and the clock of the
    // machine can be set backwards.
    const seqs = (await rows()).map((row) => Number(row['seq']));
    expect(seqs).toHaveLength(2);
    expect(seqs[1]).toBeGreaterThan(Number(seqs[0]));
  });

  it('keeps a huge input whole — S-49', async () => {
    const command = 'x'.repeat(200_000);
    await repository().append(
      AuditEntry.record({
        id: '01J0AUDIT0000000000000003',
        userId: owner,
        sessionId,
        toolUseId: null,
        toolName: 'Bash',
        input: { command },
        decision: 'recorded',
        origin: { deviceId: null, ip: null },
        at,
      }),
    );

    expect(((await rows())[0]?.['input'] as { command: string }).command).toHaveLength(200_000);
  });

  it('writes one record however often an invocation is redelivered — S-47', async () => {
    // The SDK redelivers a pending tool call after a transport gap. A second row would make the
    // trail claim the command ran twice.
    const repo = repository();

    await repo.append(entry({ id: '01J0AUDIT0000000000000008', toolUseId: 'tu-1' }));
    await repo.append(entry({ id: '01J0AUDIT0000000000000009', toolUseId: 'tu-1' }));

    expect(await rows()).toHaveLength(1);
  });

  it('keeps an invocation the SDK gave no id for, rather than dropping it', async () => {
    // A gap in the trail is worse than a duplicate, so the uniqueness is partial.
    const repo = repository();
    const anonymous = (id: string): AuditEntry =>
      AuditEntry.record({
        id,
        userId: owner,
        sessionId,
        toolUseId: null,
        toolName: 'Read',
        input: {},
        decision: 'recorded',
        origin: { deviceId: null, ip: null },
        at,
      });

    await repo.append(anonymous('01J0AUDIT000000000000000A'));
    await repo.append(anonymous('01J0AUDIT000000000000000B'));

    expect(await rows()).toHaveLength(2);
  });

  it('writes two concurrent invocations as two rows, with nothing overwritten — S-48', async () => {
    const repo = repository();

    await Promise.all([
      repo.append(concurrent('01J0AUDIT0000000000000004', 'tu-a', 'Read')),
      repo.append(concurrent('01J0AUDIT0000000000000005', 'tu-b', 'Write')),
    ]);

    expect((await rows()).map((row) => row['tool_name']).sort()).toEqual(['Read', 'Write']);
  });

  describe('append-only, as the database enforces it — D-06', () => {
    it('refuses an UPDATE, whoever is connected — S-43', async () => {
      await repository().append(entry());

      expect(
        await refusalOf(
          connection.db.execute(sql`UPDATE "audit_entries" SET "tool_name" = 'Read'`),
        ),
      ).toContain('append-only');
    });

    it('refuses an UPDATE that changes nothing at all', async () => {
      await repository().append(entry());

      expect(
        await refusalOf(
          connection.db.execute(sql`UPDATE "audit_entries" SET "tool_name" = "tool_name"`),
        ),
      ).toContain('append-only');
    });

    it('refuses a DELETE inside the retention floor — S-44', async () => {
      await repository().append(entry({ at: new Date() }));

      expect(await refusalOf(connection.db.execute(sql`DELETE FROM "audit_entries"`))).toContain(
        '90 days',
      );
    });

    it('allows a DELETE outside the floor, which is how the purge gets through', async () => {
      // The floor lives in the trigger and the window lives in configuration, and only the first
      // survives a bug of ours, a distracted migration or a DELETE typed by hand.
      const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1_000);
      await repository().append(entry({ at: old }));

      await expect(connection.db.execute(sql`DELETE FROM "audit_entries"`)).resolves.toBeDefined();
      expect(await rows()).toEqual([]);
    });

    it('refuses the older half of a mixed DELETE without letting the newer half through', async () => {
      const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1_000);
      await repository().append(entry({ id: '01J0AUDIT0000000000000006', at: old }));
      await repository().append(entry({ id: '01J0AUDIT0000000000000007', at: new Date() }));

      await refusalOf(connection.db.execute(sql`DELETE FROM "audit_entries"`));
      // The statement is one transaction: refusing any row refuses all of them.
      expect(await rows()).toHaveLength(2);
    });

    it('refuses a decision the catalogue does not have', async () => {
      await expect(
        connection.db.execute(
          sql`INSERT INTO "audit_entries" ("user_id", "session_id", "tool_name", "input", "decision", "at")
              VALUES ('u', 's', 'Bash', '{}'::jsonb, 'maybe', now())`,
        ),
      ).rejects.toThrow();
    });
  });

  it('logs the write with its parameterised SQL and a duration', async () => {
    await repository().append(entry());

    expect(log.withOp('db.query')[0]).toMatchObject({
      operation: 'audit.append',
      durationMs: expect.any(Number),
    });
  });
});
