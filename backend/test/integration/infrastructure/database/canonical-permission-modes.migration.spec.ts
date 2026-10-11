import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleClaudeDefaultsRepository } from '@adapter/outbound/persistence/claude-config/drizzle-claude-defaults.repository';
import { UserId } from '@domain/auth';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate, migrationFiles } from '@infra/database/migrator';
import { startPostgres } from '../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../support/containers/postgres';
import { aPersistenceContext } from '../../../support/fakes/persistence-context';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const MIGRATION = '0022_canonical_permission_modes.sql';
const MIGRATIONS = path.resolve(
  import.meta.dirname,
  '../../../../src/infrastructure/database/migrations',
);

/** The rows a backend before plan 28 wrote: one per mode it knew, and one that set none. */
const BEFORE: readonly [id: string, folder: string | null, mode: string | null][] = [
  ['d-default', null, 'default'],
  ['d-plan', '/srv/plan', 'plan'],
  ['d-accept', '/srv/accept', 'acceptEdits'],
  ['d-all', '/srv/all', 'allowAll'],
  ['d-unset', '/srv/unset', null],
];

/** Every mode of `claude_defaults`, by id. */
async function modes(connection: DatabaseConnection): Promise<Record<string, string | null>> {
  const rows = await connection.pool.query<{ id: string; permission_mode: string | null }>(
    'SELECT "id", "permission_mode" FROM "claude_defaults" ORDER BY "id"',
  );
  return Object.fromEntries(rows.rows.map((row) => [row.id, row.permission_mode]));
}

/** Inserts a row of `claude_defaults` with [mode]. */
function insert(connection: DatabaseConnection, id: string, mode: string | null) {
  return connection.pool.query(
    `INSERT INTO "claude_defaults" ("id", "user_id", "folder_path", "permission_mode")
     VALUES ($1, 'auth|other', $1, $2)`,
    [id, mode],
  );
}

/**
 * The migration to the canonical modes (plan 28, B-26 / S-80): the rows written before it carry the
 * canonical names, the CHECK says the new set, and run twice it changes nothing.
 */
describe('migration 0022 — the canonical permission modes', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    const before = mkdtempSync(path.join(tmpdir(), 'rc-migrations-'));
    for (const file of (await migrationFiles(MIGRATIONS)).filter((name) => name < MIGRATION)) {
      copyFileSync(path.join(MIGRATIONS, file), path.join(before, file));
    }
    await migrate(connection.pool, before);

    for (const [id, folder, mode] of BEFORE) {
      await connection.pool.query(
        `INSERT INTO "claude_defaults" ("id", "user_id", "folder_path", "permission_mode")
         VALUES ($1, 'auth|owner', $2, $3)`,
        [id, folder, mode],
      );
    }

    await migrate(connection.pool, MIGRATIONS);
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  it('renames `default` to `ask` and `plan` to `readOnly`, and keeps the rest', async () => {
    expect(await modes(connection)).toEqual({
      'd-accept': 'acceptEdits',
      'd-all': 'allowAll',
      'd-default': 'ask',
      'd-plan': 'readOnly',
      'd-unset': null,
    });
  });

  it('swaps the CHECK of the old names for the CHECK of the canonical ones', async () => {
    const checks = await connection.pool.query<{ conname: string }>(
      `SELECT "conname" FROM pg_constraint WHERE "conname" LIKE 'claude_defaults_mode_%' ORDER BY 1`,
    );

    expect(checks.rows.map((row) => row.conname)).toEqual(['claude_defaults_mode_canonical']);
  });

  it.each(['default', 'plan', 'bypassPermissions', 'yolo'])('refuses a row in %s', async (mode) => {
    await expect(insert(connection, `refused-${mode}`, mode)).rejects.toThrow(
      'claude_defaults_mode_canonical',
    );
  });

  it.each(['ask', 'acceptEdits', 'readOnly', 'allowAll'])('accepts a row in %s', async (mode) => {
    await insert(connection, `accepted-${mode}`, mode);

    expect((await modes(connection))[`accepted-${mode}`]).toBe(mode);
    await connection.pool.query('DELETE FROM "claude_defaults" WHERE "id" = $1', [
      `accepted-${mode}`,
    ]);
  });

  it('changes nothing when it runs again — S-80', async () => {
    const before = await modes(connection);

    await connection.pool.query(readFileSync(path.join(MIGRATIONS, MIGRATION), 'utf8'));

    expect(await modes(connection)).toEqual(before);
    const checks = await connection.pool.query(
      `SELECT 1 FROM pg_constraint WHERE "conname" = 'claude_defaults_mode_canonical'`,
    );
    expect(checks.rowCount).toBe(1);
  });

  it('lets the defaults written before it be read back in the canonical modes', async () => {
    const repository = new DrizzleClaudeDefaultsRepository(
      aPersistenceContext(connection.db),
      new SequentialIds(),
    );

    const read = await repository.read(UserId.create('auth|owner'));

    expect(read.user?.permissionMode).toBe('ask');
    expect(
      Object.fromEntries(
        read.overrides.map((entry) => [entry.folder, entry.values.permissionMode]),
      ),
    ).toEqual({
      '/srv/plan': 'readOnly',
      '/srv/accept': 'acceptEdits',
      '/srv/all': 'allowAll',
      '/srv/unset': null,
    });
  });
});
