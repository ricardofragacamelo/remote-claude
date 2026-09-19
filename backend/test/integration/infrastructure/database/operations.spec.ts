import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  COMMANDS,
  SEED_OWNER,
  isDatabaseCommand,
  runMigrate,
  runReset,
  runSeed,
} from '@infra/database/operations';
import { startPostgres } from '../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../support/containers/postgres';

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

describe('isDatabaseCommand', () => {
  it.each(Object.keys(COMMANDS))('recognises %s', (command) => {
    expect(isDatabaseCommand(command)).toBe(true);
  });

  it('does not recognise anything else', () => {
    expect(isDatabaseCommand('drop-everything')).toBe(false);
  });
});
