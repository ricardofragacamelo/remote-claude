import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';

import { AUDIT_PURGE_LOCK_KEY } from '@adapter/outbound/persistence/audit/drizzle-audit-retention.store';
import {
  COMMANDS,
  SEED_OWNER,
  isDatabaseCommand,
  runMigrate,
  runPurge,
  runReset,
  runSeed,
} from '@infra/database/operations';
import type { DatabaseCommandContext } from '@infra/database/operations';
import { startPostgres } from '../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../support/containers/postgres';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

describe('the database commands', () => {
  let database: DisposablePostgres;
  let pool: pg.Pool;

  beforeAll(async () => {
    database = await startPostgres();
    pool = new pg.Pool({ connectionString: database.url });
  });

  afterAll(async () => {
    await pool.end();
    await database.stop();
  });

  beforeEach(async () => {
    await pool.query('DROP SCHEMA IF EXISTS "public" CASCADE');
    await pool.query('CREATE SCHEMA "public"');
  });

  /** How many sessions the seed owner has. */
  async function seededRows(): Promise<number> {
    const rows = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "diag_sessions" WHERE "owner_id" = $1',
      [SEED_OWNER],
    );

    return Number(rows.rows[0]?.count ?? '0');
  }

  it('migrate brings an empty database up to date', async () => {
    const result = await runMigrate(pool);

    expect(result.applied.length).toBeGreaterThan(0);
    expect(await seededRows()).toBe(0);
  });

  it('migrate applies nothing the second time', async () => {
    await runMigrate(pool);

    await expect(runMigrate(pool)).resolves.toMatchObject({ applied: [] });
  });

  it('reset produces a schema and the demo data in one command', async () => {
    const result = await runReset(pool);

    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.seeded).toBeGreaterThan(0);
    expect(await seededRows()).toBe(result.seeded);
  });

  it('reset twice leaves exactly the same state', async () => {
    await runReset(pool);
    const first = await seededRows();

    await runReset(pool);

    expect(await seededRows()).toBe(first);
  });

  it('reset clears whatever was there before', async () => {
    await runMigrate(pool);
    await pool.query(
      `INSERT INTO "diag_sessions" ("id", "owner_id", "opened_at", "last_pinged_at")
       VALUES ('01J0ABCDEFGHJKMNPQRSTVWXYZ', 'auth|someone', now(), now())`,
    );

    await runReset(pool);

    const rows = await pool.query('SELECT "id" FROM "diag_sessions" WHERE "owner_id" = $1', [
      'auth|someone',
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it('seed on its own is idempotent', async () => {
    await runMigrate(pool);

    await runSeed(pool);
    await runSeed(pool);

    expect(await seededRows()).toBe(2);
  });
});

describe('the purge, from the command line — B-18', () => {
  let database: DisposablePostgres;
  let pool: pg.Pool;
  let log: RecordingLogger;

  beforeAll(async () => {
    database = await startPostgres();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
    await database.stop();
  });

  beforeEach(() => {
    log = new RecordingLogger();
  });

  const context = (over: pg.Pool = pool): DatabaseCommandContext => ({
    pool: over,
    logger: log.logger,
    retentionDays: 90,
  });

  /** An entry of the trail, long past the window. */
  async function plantOld(id: string): Promise<void> {
    await pool.query(
      `INSERT INTO "audit_entries" ("id", "user_id", "session_id", "tool_use_id", "tool_name", "input", "decision", "at")
       VALUES ($1, 'auth|owner', 'session', $1, 'Bash', '{}'::jsonb, 'recorded', now() - interval '200 days')`,
      [id],
    );
  }

  it('purges, records itself as the command, and succeeds', async () => {
    await plantOld('old-1');

    const outcome = await COMMANDS.purge(context());

    expect(outcome.succeeded).toBe(true);
    expect(outcome.result).toMatchObject({
      status: 'completed',
      triggeredBy: 'cli',
      retentionDays: 90,
      trails: [
        { trail: 'entries', deleted: 1, error: null },
        { trail: 'events', deleted: 0, error: null },
      ],
    });
    const recorded = await pool.query<{ triggered_by: string }>(
      'SELECT "triggered_by" FROM "audit_purges"',
    );
    expect(recorded.rows).toEqual([{ triggered_by: 'cli' }]);
  });

  it('leaves at once, succeeding, when another purge holds the lock — S-90', async () => {
    await plantOld('old-2');
    const other = await pool.connect();
    await other.query('SELECT pg_advisory_lock($1)', [AUDIT_PURGE_LOCK_KEY]);

    try {
      const outcome = await COMMANDS.purge(context());

      expect(outcome.succeeded).toBe(true);
      expect(outcome.result).toMatchObject({ status: 'skipped', reason: 'alreadyRunning' });
    } finally {
      await other.query('SELECT pg_advisory_unlock($1)', [AUDIT_PURGE_LOCK_KEY]);
      other.release();
    }

    const left = await pool.query('SELECT "id" FROM "audit_entries" WHERE "id" = $1', ['old-2']);
    expect(left.rowCount).toBe(1);
  });

  it('fails, saying nothing was deleted, when it cannot reach the database — S-91', async () => {
    const nowhere = new pg.Pool({
      connectionString: 'postgresql://nobody:nothing@127.0.0.1:1/none',
      connectionTimeoutMillis: 2_000,
    });

    try {
      const outcome = await COMMANDS.purge(context(nowhere));

      expect(outcome.succeeded).toBe(false);
      expect(outcome.result).toMatchObject({
        status: 'notStarted',
        triggeredBy: 'cli',
        retentionDays: 90,
        error: expect.stringContaining('ECONNREFUSED'),
      });
      expect(log.withOp('audit.purge')).toMatchObject([{ level: 'error' }]);
    } finally {
      await nowhere.end();
    }
  });

  it('fails when a trail refused a batch, and says which', async () => {
    await plantOld('old-3');
    await pool.query(
      `CREATE OR REPLACE FUNCTION "test_refuse"() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'refused by the test'; END; $$ LANGUAGE plpgsql`,
    );
    await pool.query(
      `CREATE TRIGGER "test_refuse" BEFORE DELETE ON "audit_entries"
       FOR EACH ROW EXECUTE FUNCTION "test_refuse"()`,
    );

    try {
      const result = await runPurge(context());

      expect(result).toMatchObject({
        status: 'failed',
        trails: [
          { trail: 'entries', deleted: 0, error: 'refused by the test' },
          { trail: 'events', deleted: 0, error: null },
        ],
      });
      await expect(COMMANDS.purge(context())).resolves.toMatchObject({ succeeded: false });
    } finally {
      await pool.query('DROP TRIGGER "test_refuse" ON "audit_entries"');
    }
  });
});

describe('isDatabaseCommand', () => {
  it.each(Object.keys(COMMANDS))('recognises %s', (command) => {
    expect(isDatabaseCommand(command)).toBe(true);
  });

  it('does not recognise anything else', () => {
    expect(isDatabaseCommand('drop-everything')).toBe(false);
  });
});
