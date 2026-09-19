import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleDiagSessionRepository } from '@adapter/outbound/persistence/diag/drizzle-diag-session.repository';
import { UserId } from '@domain/auth';
import { DiagSession } from '@domain/diag';
import { SessionId } from '@domain/session';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const owner = UserId.create('auth|owner');
const openedAt = new Date('2026-09-13T12:00:00.000Z');

describe('DrizzleDiagSessionRepository', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let clock: FixedClock;
  let log: RecordingLogger;
  let repository: DrizzleDiagSessionRepository;

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
    // Each test builds and tears down its own state; none depends on another having run.
    await connection.db.execute(sql`TRUNCATE TABLE "diag_sessions"`);
    log = new RecordingLogger();
  });

  beforeAll(() => {
    clock = new FixedClock(openedAt);
    log = new RecordingLogger();
  });

  const build = (): DrizzleDiagSessionRepository =>
    new DrizzleDiagSessionRepository(
      aPersistenceContext(connection.db, { clock, logger: log.logger }),
    );

  const id = (raw = '01J0ABCDEFGHJKMNPQRSTVWXYZ'): SessionId => SessionId.create(raw);

  it('answers null for a session that was never saved', async () => {
    repository = build();

    await expect(repository.findById(id())).resolves.toBeNull();
  });

  it('saves a session and reads back an entity, never a row', async () => {
    repository = build();
    const session = DiagSession.open(id(), owner, openedAt);
    session.ping(new Date('2026-09-13T12:00:05.000Z'), 'n');

    await repository.save(session);
    const found = await repository.findById(id());

    expect(found).toBeInstanceOf(DiagSession);
    expect(found?.snapshot()).toEqual(session.snapshot());
  });

  it('updates instead of inserting a second row when the same session is saved twice', async () => {
    repository = build();
    const session = DiagSession.open(id(), owner, openedAt);

    await repository.save(session);
    session.ping(new Date('2026-09-13T12:00:05.000Z'), 'n');
    await repository.save(session);

    const rows = await connection.db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM "diag_sessions"`,
    );
    expect(rows.rows[0]?.count).toBe('1');
    expect((await repository.findById(id()))?.pingCount).toBe(1);
  });

  it('keeps two sessions apart', async () => {
    repository = build();

    await repository.save(DiagSession.open(id(), owner, openedAt));
    await repository.save(DiagSession.open(id('01J0ABCDEFGHJKMNPQRSTVWXY0'), owner, openedAt));

    expect(await repository.findById(id())).not.toBeNull();
    expect(await repository.findById(id('01J0ABCDEFGHJKMNPQRSTVWXY0'))).not.toBeNull();
  });

  it('stores instants with a zone and reads them back in UTC', async () => {
    repository = build();
    const at = new Date('2026-09-13T23:45:12.000Z');
    const session = DiagSession.open(id(), owner, at);

    await repository.save(session);

    expect((await repository.findById(id()))?.openedAt.toISOString()).toBe(
      '2026-09-13T23:45:12.000Z',
    );
  });

  it('stamps the update instant from the clock, not from the database', async () => {
    repository = build();
    clock.set(new Date('2026-09-13T18:00:00.000Z'));

    await repository.save(DiagSession.open(id(), owner, openedAt));

    const rows = await connection.db.execute<{ updated_at: string }>(
      sql`SELECT to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM "diag_sessions"`,
    );
    expect(rows.rows[0]?.updated_at).toBe('2026-09-13T18:00:00Z');
    clock.set(openedAt);
  });

  it('logs both queries with their parameterised SQL and a duration', async () => {
    repository = build();

    await repository.save(DiagSession.open(id(), owner, openedAt));
    await repository.findById(id());

    const queries = log.withOp('db.query');
    expect(queries.map((line) => line['operation'])).toEqual(['diag.save', 'diag.findById']);
    expect(queries[0]).toMatchObject({ durationMs: expect.any(Number) });
    expect(String(queries[1]?.['sql'])).toContain('$1');
    expect(JSON.stringify(queries)).not.toContain('01J0ABCDEFGHJKMNPQRSTVWXYZ');
  });

  it('refuses a ping count below zero, at the database level', async () => {
    await expect(
      connection.db.execute(
        sql`INSERT INTO "diag_sessions" ("id", "owner_id", "opened_at", "last_pinged_at", "ping_count")
            VALUES ('01J0ABCDEFGHJKMNPQRSTVWXYZ', 'auth|owner', now(), now(), -1)`,
      ),
    ).rejects.toThrow();
  });
});
