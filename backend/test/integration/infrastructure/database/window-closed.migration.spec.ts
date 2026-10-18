import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate, migrationFiles } from '@infra/database/migrator';
import { startPostgres } from '../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../support/containers/postgres';

const MIGRATION = '0026_window_closed.sql';
const CONVERSATION = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const AT = '2026-09-26T12:00:00.000Z';

/** The directory of the migrations, and an empty one for the files before the one under test. */
function migrationsBefore(): { readonly all: string; readonly before: string } {
  const all = path.resolve(
    import.meta.dirname,
    '../../../../src/infrastructure/database/migrations',
  );
  const before = mkdtempSync(path.join(tmpdir(), 'rc-migrations-'));
  return { all, before };
}

/** The text of the migration under test. */
function migrationSql(): string {
  return readFileSync(
    path.resolve(
      import.meta.dirname,
      `../../../../src/infrastructure/database/migrations/${MIGRATION}`,
    ),
    'utf8',
  );
}

/**
 * The migration that closes the window of the previous protocol (plan 28, F7, B-47): the column
 * `0021` kept beside `(engine, conversation_id)` drops from the three tables it copied it into, and
 * `session_origins`' primary key moves to the pair — S-130.
 */
describe('migration 0026 — the window of the previous protocol closes', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    const { all, before } = migrationsBefore();
    for (const file of (await migrationFiles(all)).filter((name) => name < MIGRATION)) {
      copyFileSync(path.join(all, file), path.join(before, file));
    }
    await migrate(connection.pool, before);

    await connection.pool.query(
      `INSERT INTO "session_origins" ("claude_session_id", "engine", "conversation_id", "session_id", "user_id", "workspace_path", "opened_at")
       VALUES ($1, 'claude', $1, $2, 'auth|owner', '/srv/app', $3)`,
      [CONVERSATION, SESSION, AT],
    );
    await connection.pool.query(
      `INSERT INTO "session_file_states" ("session_id", "path", "claude_session_id", "engine", "conversation_id", "hash", "mtime", "size_bytes", "updated_at")
       VALUES ($1, '/srv/app/a.md', $2, 'claude', $2, 'h', $3, 3, $3),
              ($1, '/srv/app/old.md', NULL, NULL, NULL, 'h', $3, 3, $3)`,
      [SESSION, CONVERSATION, AT],
    );
    await connection.pool.query(
      `INSERT INTO "turn_file_checkpoints" ("session_id", "claude_session_id", "engine", "conversation_id", "prompt_id", "path", "existed_before", "blob_path", "hash", "size_bytes", "restorable", "prompt_text", "captured_at")
       VALUES ($1, $2, 'claude', $2, 'p1', '/srv/app/a.md', 'present', NULL, 'h', 3, 'yes', 'refactor', $3)`,
      [SESSION, CONVERSATION, AT],
    );

    await migrate(connection.pool, all);
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  it('drops the old column from the three tables — S-130', async () => {
    const columns = await connection.pool.query<{ table_name: string; column_name: string }>(
      `SELECT "table_name", "column_name" FROM information_schema.columns
       WHERE "column_name" = 'claude_session_id'`,
    );

    expect(columns.rows).toEqual([]);
  });

  it('keeps every row, named by (engine, conversation_id) alone — S-130', async () => {
    const origins = await connection.pool.query(
      'SELECT "engine", "conversation_id" FROM "session_origins"',
    );
    const states = await connection.pool.query(
      'SELECT "engine", "conversation_id" FROM "session_file_states" ORDER BY "path"',
    );
    const checkpoints = await connection.pool.query(
      'SELECT "engine", "conversation_id" FROM "turn_file_checkpoints"',
    );

    expect(origins.rows).toEqual([{ engine: 'claude', conversation_id: CONVERSATION }]);
    expect(states.rows).toEqual([
      { engine: 'claude', conversation_id: CONVERSATION },
      // A row written before `0013` named no conversation, and still names none — fronteira.
      { engine: null, conversation_id: null },
    ]);
    expect(checkpoints.rows).toEqual([{ engine: 'claude', conversation_id: CONVERSATION }]);
  });

  it("moves session_origins' primary key to (engine, conversation_id) — S-130", async () => {
    const key = await connection.pool.query<{ column_name: string }>(
      `SELECT "column_name" FROM information_schema.key_column_usage
       WHERE "table_name" = 'session_origins' AND "constraint_name" = 'session_origins_pkey'
       ORDER BY "ordinal_position"`,
    );

    expect(key.rows.map((row) => row.column_name)).toEqual(['engine', 'conversation_id']);

    // The promoted key still refuses a second conversation of the same engine.
    await expect(
      connection.pool.query(
        `INSERT INTO "session_origins" ("engine", "conversation_id", "session_id", "user_id", "workspace_path", "opened_at")
         VALUES ('claude', $1, $2, 'auth|owner', '/srv/app', $3)`,
        [CONVERSATION, SESSION, AT],
      ),
    ).rejects.toThrow();
  });

  it('changes nothing when it runs again — idempotência', async () => {
    const before = await connection.pool.query('SELECT * FROM "session_origins" ORDER BY "engine"');

    // `migrate()` itself would skip a file already recorded as applied; the SQL is run directly so
    // the statements' own idempotence is what is being proved, not the runner's bookkeeping.
    await connection.pool.query(migrationSql());

    const after = await connection.pool.query('SELECT * FROM "session_origins" ORDER BY "engine"');
    expect(after.rows).toEqual(before.rows);

    const key = await connection.pool.query<{ column_name: string }>(
      `SELECT "column_name" FROM information_schema.key_column_usage
       WHERE "table_name" = 'session_origins' AND "constraint_name" = 'session_origins_pkey'
       ORDER BY "ordinal_position"`,
    );
    expect(key.rows.map((row) => row.column_name)).toEqual(['engine', 'conversation_id']);
  });
});
