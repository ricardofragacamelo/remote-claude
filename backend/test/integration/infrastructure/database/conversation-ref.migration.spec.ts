import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { ConversationRef } from '@domain/engine';
import { SessionId } from '@domain/session';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate, migrationFiles } from '@infra/database/migrator';
import { startPostgres } from '../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../support/containers/postgres';
import { aPersistenceContext } from '../../../support/fakes/persistence-context';

const MIGRATION = '0021_conversation_ref.sql';
const OURS = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
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

/**
 * An empty directory holding only the migrations up to and including [migration] — never the ones
 * after it. A later migration may drop a column this one still manipulates (B-47 did, to
 * `claude_session_id`), and this spec replays this file's own SQL directly: it must run against the
 * schema as this migration itself left it, not as a migration written years later leaves it.
 */
async function migrationsThrough(all: string, migration: string): Promise<string> {
  const through = mkdtempSync(path.join(tmpdir(), 'rc-migrations-through-'));
  for (const file of (await migrationFiles(all)).filter((name) => name <= migration)) {
    copyFileSync(path.join(all, file), path.join(through, file));
  }
  return through;
}

/**
 * The migration that names a conversation by its engine (plan 28, B-11): rows written before it keep
 * their conversation, twice applied it changes nothing, and the undo still reaches what they recorded.
 */
describe('migration 0021 — the conversation as `{ engine, conversation_id }`', () => {
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

    // What a backend before plan 28 wrote: the conversation by the id of Claude's store alone.
    await connection.pool.query(
      `INSERT INTO "session_origins" ("claude_session_id", "session_id", "user_id", "workspace_path", "opened_at")
       VALUES ($1, $2, 'auth|owner', '/srv/app', $3)`,
      [OURS, SESSION, AT],
    );
    await connection.pool.query(
      `INSERT INTO "session_file_states" ("session_id", "path", "claude_session_id", "hash", "mtime", "size_bytes", "updated_at")
       VALUES ($1, '/srv/app/a.md', $2, 'h', $3, 3, $3), ($1, '/srv/app/old.md', NULL, 'h', $3, 3, $3)`,
      [SESSION, OURS, AT],
    );
    await connection.pool.query(
      `INSERT INTO "turn_file_checkpoints" ("session_id", "claude_session_id", "prompt_id", "path", "existed_before", "blob_path", "hash", "size_bytes", "restorable", "prompt_text", "captured_at")
       VALUES ($1, $2, 'p1', '/srv/app/a.md', 'present', NULL, 'h', 3, 'yes', 'refactor', $3)`,
      [SESSION, OURS, AT],
    );

    await migrate(connection.pool, await migrationsThrough(all, MIGRATION));
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  it('copies every conversation to `(engine, conversation_id)`, in the three tables — S-33', async () => {
    const origins = await connection.pool.query(
      'SELECT "engine", "conversation_id" FROM "session_origins"',
    );
    const states = await connection.pool.query(
      'SELECT "engine", "conversation_id" FROM "session_file_states" ORDER BY "path"',
    );
    const checkpoints = await connection.pool.query(
      'SELECT "engine", "conversation_id" FROM "turn_file_checkpoints"',
    );

    expect(origins.rows).toEqual([{ engine: 'claude', conversation_id: OURS }]);
    expect(states.rows).toEqual([
      { engine: 'claude', conversation_id: OURS },
      // A row written before `0013` named no conversation, and still names none.
      { engine: null, conversation_id: null },
    ]);
    expect(checkpoints.rows).toEqual([{ engine: 'claude', conversation_id: OURS }]);
  });

  it('leaves the engine with no default, so the code always says which', async () => {
    const defaults = await connection.pool.query(
      `SELECT "table_name", "column_default" FROM information_schema.columns
       WHERE "column_name" = 'engine' ORDER BY "table_name"`,
    );

    expect(
      defaults.rows.every((row: { column_default: string | null }) => row.column_default === null),
    ).toBe(true);
  });

  it('neither duplicates nor overwrites when it runs again — S-34', async () => {
    await connection.pool.query(
      `UPDATE "session_origins" SET "conversation_id" = 'renamed-by-hand' WHERE "session_id" = $1`,
      [SESSION],
    );
    const sql = readFileSync(
      path.resolve(
        import.meta.dirname,
        `../../../../src/infrastructure/database/migrations/${MIGRATION}`,
      ),
      'utf8',
    ).replace(/DO \$\$[\s\S]*END \$\$;/, '');

    await connection.pool.query(sql);

    const origins = await connection.pool.query('SELECT "conversation_id" FROM "session_origins"');
    expect(origins.rows).toEqual([{ conversation_id: 'renamed-by-hand' }]);
    await connection.pool.query(
      `UPDATE "session_origins" SET "conversation_id" = $1 WHERE "session_id" = $2`,
      [OURS, SESSION],
    );
  });

  it('refuses, and applies nothing, when a row would lose its conversation — R-07', async () => {
    const guard = /DO \$\$[\s\S]*END \$\$;/.exec(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          `../../../../src/infrastructure/database/migrations/${MIGRATION}`,
        ),
        'utf8',
      ),
    )?.[0];
    await connection.pool.query(
      `UPDATE "turn_file_checkpoints" SET "conversation_id" = 'lost' WHERE "session_id" = $1`,
      [SESSION],
    );

    await expect(connection.pool.query(String(guard))).rejects.toThrow(
      'did not keep their conversation',
    );

    await connection.pool.query(
      `UPDATE "turn_file_checkpoints" SET "conversation_id" = $1 WHERE "session_id" = $2`,
      [OURS, SESSION],
    );
  });

  it('lets the undo of a conversation recorded before it find its checkpoints — S-35', async () => {
    const files = new DrizzleSessionFileRepository(aPersistenceContext(connection.db));
    const conversation = ConversationRef.create('claude', OURS);

    const checkpoints = await files.checkpointsOfConversation(
      SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY0'),
      conversation,
    );
    const states = await files.statesOfConversation(
      SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY0'),
      conversation,
    );

    expect(checkpoints.map((checkpoint) => checkpoint.snapshot().path)).toEqual(['/srv/app/a.md']);
    expect(checkpoints[0]?.snapshot().conversation?.key).toBe(`claude:${OURS}`);
    expect(states.map((state) => state.snapshot().path)).toEqual(['/srv/app/a.md']);
    expect(await files.sessionsOfConversations([conversation])).toEqual([SESSION]);
  });
});
