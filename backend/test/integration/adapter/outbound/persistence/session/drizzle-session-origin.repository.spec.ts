import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleSessionOriginRepository } from '@adapter/outbound/persistence/session/drizzle-session-origin.repository';
import type { SessionOrigin } from '@application/session';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import { WorkspacePath } from '@domain/workspace';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';
import { conversationId } from '../../../../../support/builders/transcript.builder';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');

/** A provenance record, with what a test does not care about defaulted. */
const origin = (n: number, openedBy = owner): SessionOrigin => ({
  claudeSessionId: ClaudeSessionId.create(conversationId(n)),
  sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
  openedBy,
  workspace: WorkspacePath.create('/srv/projects/app'),
  openedAt: new Date('2026-09-25T10:00:00.000Z'),
});

/**
 * `session_origins`, against a real PostgreSQL — plan 04, F0.
 *
 * What is proved is what the fake cannot be trusted with: that a second record of the same
 * conversation keeps the first owner, and that "which of these are ours" answers exactly the ids
 * asked about.
 */
describe('DrizzleSessionOriginRepository', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let log: RecordingLogger;

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
    await connection.db.execute(sql`TRUNCATE TABLE "session_origins"`);
  });

  const build = (): DrizzleSessionOriginRepository => {
    log = new RecordingLogger();
    return new DrizzleSessionOriginRepository(
      aPersistenceContext(connection.db, { logger: log.logger }),
    );
  };

  it('answers who opened each conversation it holds, and nothing for the others', async () => {
    const repository = build();
    await repository.record(origin(1));
    await repository.record(origin(2, stranger));

    const openers = await repository.openersOf([
      ClaudeSessionId.create(conversationId(1)),
      ClaudeSessionId.create(conversationId(2)),
      ClaudeSessionId.create(conversationId(3)),
    ]);

    expect([...openers.entries()].map(([id, user]) => [id, user.value]).sort()).toEqual([
      [conversationId(1), 'auth|owner'],
      [conversationId(2), 'auth|stranger'],
    ]);
  });

  it('keeps the first owner when the same conversation is recorded twice', async () => {
    const repository = build();
    await repository.record(origin(1));
    await repository.record(origin(1, stranger));

    const rows = await connection.db.execute<{ user_id: string }>(
      sql`SELECT "user_id" FROM "session_origins"`,
    );

    expect(rows.rows).toEqual([{ user_id: 'auth|owner' }]);
  });

  it('writes provenance and nothing else: no summary, no message, no line of the transcript', async () => {
    await build().record(origin(1));

    const columns = await connection.db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'session_origins' ORDER BY ordinal_position`,
    );

    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'claude_session_id',
      'session_id',
      'user_id',
      'workspace_path',
      'opened_at',
    ]);
  });

  it('asks the database nothing when asked about nothing', async () => {
    const repository = build();

    expect((await repository.openersOf([])).size).toBe(0);
    expect(log.withOp('db.query')).toEqual([]);
  });

  it('logs the parameterised query, never the values', async () => {
    const repository = build();
    await repository.record(origin(1));

    expect(log.withOp('db.query')[0]).toMatchObject({ operation: 'sessionOrigin.record' });
    expect(JSON.stringify(log.lines)).not.toContain('auth|owner');
  });
});
