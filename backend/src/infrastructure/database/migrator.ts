import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

/**
 * Key of the advisory lock the migration runs behind.
 *
 * Two instances starting at the same moment both want to migrate; without the lock they race and
 * the schema ends up half applied. Arbitrary but fixed — what matters is that everyone uses the
 * same number. See docs/architecture/backend/05-persistence.md#migrations.
 */
const LOCK_KEY = 4_073_110_001;

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Migration files, in the order their names sort. */
export async function migrationFiles(directory: string = MIGRATIONS_DIR): Promise<string[]> {
  const entries = await fs.readdir(directory);
  return entries.filter((entry) => entry.endsWith('.sql')).sort();
}

/**
 * Applies every migration that has not run yet, behind an advisory lock.
 *
 * Idempotent: a file already recorded in `_migrations` is skipped, so a second boot applies
 * nothing and does not fail.
 *
 * @returns the names it applied this time, in order
 */
export async function migrate(
  pool: pg.Pool,
  directory: string = MIGRATIONS_DIR,
): Promise<string[]> {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    await client.query(
      'CREATE TABLE IF NOT EXISTS "_migrations" ' +
        '("name" text PRIMARY KEY NOT NULL, "applied_at" timestamptz NOT NULL DEFAULT now())',
    );

    const applied = await client.query<{ name: string }>('SELECT "name" FROM "_migrations"');
    const done = new Set(applied.rows.map((row) => row.name));
    const pending = (await migrationFiles(directory)).filter((name) => !done.has(name));

    for (const name of pending) {
      const sql = await fs.readFile(path.join(directory, name), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO "_migrations" ("name") VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return pending;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    client.release();
  }
}
