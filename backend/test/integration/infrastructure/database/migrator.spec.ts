import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import { migrate, migrationFiles } from '@infra/database/migrator';
import { startPostgres } from '../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../support/containers/postgres';

describe('migrate', () => {
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

  it('applies every migration on an empty database', async () => {
    const applied = await migrate(pool);

    expect(applied).toEqual(await migrationFiles());
    expect(applied.length).toBeGreaterThan(0);
  });

  it('creates the table the schema declares, with timestamps that carry a zone', async () => {
    await migrate(pool);

    const columns = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'diag_sessions' ORDER BY column_name`,
    );

    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'created_at',
      'id',
      'last_pinged_at',
      'opened_at',
      'owner_id',
      'ping_count',
      'updated_at',
    ]);
    expect(
      columns.rows
        .filter((row) => row.column_name.endsWith('_at'))
        .every((row) => row.data_type === 'timestamp with time zone'),
    ).toBe(true);
  });

  it('applies nothing on a second run, and does not fail', async () => {
    await migrate(pool);

    await expect(migrate(pool)).resolves.toEqual([]);
  });

  it('does not corrupt the schema when two instances start at the same moment', async () => {
    await pool.query('DROP TABLE IF EXISTS "diag_sessions"');
    await pool.query('DROP TABLE IF EXISTS "_migrations"');

    const [first, second] = await Promise.all([migrate(pool), migrate(pool)]);

    // The advisory lock serialises them: one applies the files, the other finds nothing to do.
    expect([first.length, second.length].sort()).toEqual([0, (await migrationFiles()).length]);
  });

  it('releases the lock even when a migration fails', async () => {
    await expect(migrate(pool, '/tmp/does-not-exist-remote-claude')).rejects.toThrow();

    // A held lock would make this hang until the suite times out.
    await expect(migrate(pool)).resolves.toBeDefined();
  });
});
