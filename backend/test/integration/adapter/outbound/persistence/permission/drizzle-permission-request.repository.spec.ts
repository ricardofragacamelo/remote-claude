import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzlePermissionRequestRepository } from '@adapter/outbound/persistence/permission/drizzle-permission-request.repository';
import { UserId } from '@domain/auth';
import { PermissionRequest, interactionFor } from '@domain/permission';
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
const at = new Date('2026-10-08T12:00:00.000Z');

/** Where the migrations of the product are, and the last one before the answers had a column. */
const MIGRATIONS = path.resolve(
  import.meta.dirname,
  '../../../../../../src/infrastructure/database/migrations',
);
const BEFORE_ANSWERS = '0018_file_history.sql';

/**
 * The answers to a question, in `permission_requests` — plan 24, B-08, S-44.
 *
 * A database that was running before `0019` is migrated with its rows in place: the request
 * written then reads with no answers, and a question answered after is written and read back whole.
 */
describe('the answers of a question in the history of requests', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let earlier: string;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);

    // The schema as it was before this plan: every migration up to `0018`, and no further.
    earlier = mkdtempSync(path.join(tmpdir(), 'rc-migrations-'));
    for (const file of readdirSync(MIGRATIONS).filter((name) => name <= BEFORE_ANSWERS)) {
      cpSync(path.join(MIGRATIONS, file), path.join(earlier, file));
    }
    await migrate(connection.pool, earlier);
  });

  afterAll(async () => {
    rmSync(earlier, { recursive: true, force: true });
    await connection.pool.end();
    await database.stop();
  });

  const repository = (): DrizzlePermissionRequestRepository =>
    new DrizzlePermissionRequestRepository(aPersistenceContext(connection.db));

  const answersOf = async (requestId: string): Promise<unknown> => {
    const rows = await connection.db.execute<{ answers: unknown }>(
      sql`SELECT "answers" FROM "permission_requests" WHERE "id" = ${requestId}`,
    );
    return rows.rows[0]?.answers;
  };

  it('adds the column as nullable, and reads a row written before it with no answers — S-44', async () => {
    await connection.db.execute(
      sql`INSERT INTO "permission_requests"
            ("id", "user_id", "session_id", "tool_use_id", "tool_name", "input", "risk_hint",
             "status", "requested_at", "expires_at")
          VALUES ('request-old', ${owner.value}, ${sessionId.value}, 'toolu-old', 'AskUserQuestion',
                  '{"questions":[]}', 'destructive', 'pending', ${at}, ${at})`,
    );

    await migrate(connection.pool);

    const column = await connection.db.execute<{ is_nullable: string; data_type: string }>(
      sql`SELECT "is_nullable", "data_type" FROM information_schema.columns
          WHERE "table_name" = 'permission_requests' AND "column_name" = 'answers'`,
    );
    expect(column.rows[0]).toEqual({ is_nullable: 'YES', data_type: 'jsonb' });
    expect(await answersOf('request-old')).toBeNull();
  });

  it('writes the answers of a question when it is settled, and nothing while it is open', async () => {
    const input = {
      questions: [
        {
          question: 'Which library?',
          header: 'Library',
          multiSelect: true,
          options: [
            { label: 'date-fns', description: '' },
            { label: 'luxon', description: '' },
          ],
        },
      ],
    };
    const request = PermissionRequest.open({
      id: 'request-question',
      sessionId,
      userId: owner,
      projectPath: null,
      toolUseId: 'toolu-question',
      toolName: 'AskUserQuestion',
      input,
      interaction: interactionFor('AskUserQuestion', input),
      riskHint: 'read',
      requestedAt: at,
      expiresAt: new Date(at.getTime() + 600_000),
    });

    await repository().open(request);
    expect(await answersOf('request-question')).toBeNull();

    request.resolve({
      decision: 'allow',
      reason: null,
      scope: 'once',
      resolvedBy: owner,
      resolvedFrom: 'web',
      auto: false,
      answers: [{ questionId: 'q1', selected: ['date-fns', 'luxon'], other: 'and a third' }],
      at,
    });
    await repository().update(request);

    expect(await answersOf('request-question')).toEqual([
      { questionId: 'q1', selected: ['date-fns', 'luxon'], other: 'and a third' },
    ]);
  });
});
