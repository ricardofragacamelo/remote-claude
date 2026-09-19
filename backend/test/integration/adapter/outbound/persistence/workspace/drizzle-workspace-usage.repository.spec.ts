import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleWorkspaceUsageRepository } from '@adapter/outbound/persistence/workspace/drizzle-workspace-usage.repository';
import { UserId } from '@domain/auth';
import { WorkspacePath, WorkspaceUsage } from '@domain/workspace';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const root = WorkspacePath.create('/srv/projects');
const other = WorkspacePath.create('/srv/other');
const at = new Date('2026-09-18T10:00:00.000Z');

describe('DrizzleWorkspaceUsageRepository', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let clock: FixedClock;
  let log: RecordingLogger;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    await migrate(connection.pool);
    clock = new FixedClock(at);
    log = new RecordingLogger();
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  afterEach(async () => {
    await connection.db.execute(sql`TRUNCATE TABLE "workspaces"`);
    clock.set(at);
    log = new RecordingLogger();
  });

  const build = (): DrizzleWorkspaceUsageRepository =>
    new DrizzleWorkspaceUsageRepository(
      aPersistenceContext(connection.db, { clock, logger: log.logger }),
    );

  const use = (user = owner, path = root, label = 'Projects', when = at): WorkspaceUsage =>
    WorkspaceUsage.record(user, path, label, when);

  /** How many rows the table holds right now. */
  async function rowCount(): Promise<string> {
    const rows = await connection.db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM "workspaces"`,
    );
    return rows.rows[0]?.count ?? '0';
  }

  it('answers nothing for a user who never opened anything', async () => {
    await expect(build().findByUser(owner)).resolves.toEqual([]);
  });

  it('records a use and reads back an entity, never a row', async () => {
    const repository = build();
    await repository.record(use());

    const found = await repository.findByUser(owner);

    expect(found[0]).toBeInstanceOf(WorkspaceUsage);
    expect(found[0]?.snapshot()).toEqual(use().snapshot());
  });

  it('does not duplicate a row when the same root is used twice — S-20', async () => {
    const repository = build();

    await repository.record(use());
    await repository.record(use(owner, root, 'Projects', new Date('2026-09-19T08:00:00.000Z')));

    expect(await rowCount()).toBe('1');
    expect((await repository.findByUser(owner))[0]?.lastUsedAt).toEqual(
      new Date('2026-09-19T08:00:00.000Z'),
    );
  });

  it('keeps the same root of two different users apart — S-20', async () => {
    // The identity is the pair. A key on the path alone would let one user's use overwrite the
    // other's, which with multi-user is a row silently changing owner.
    const repository = build();

    await repository.record(use(owner));
    await repository.record(use(stranger));

    expect(await rowCount()).toBe('2');
    expect(await repository.findByUser(owner)).toHaveLength(1);
    expect(await repository.findByUser(stranger)).toHaveLength(1);
  });

  it('keeps two roots of the same user apart', async () => {
    const repository = build();

    await repository.record(use(owner, root));
    await repository.record(use(owner, other, 'Other'));

    expect(await repository.findByUser(owner)).toHaveLength(2);
  });

  it('never answers another user’s rows', async () => {
    const repository = build();
    await repository.record(use(stranger));

    expect(await repository.findByUser(owner)).toEqual([]);
  });

  it('lists the most recently used root first', async () => {
    const repository = build();

    await repository.record(use(owner, root, 'Projects', at));
    await repository.record(use(owner, other, 'Other', new Date('2026-09-19T08:00:00.000Z')));

    expect((await repository.findByUser(owner)).map((usage) => usage.label)).toEqual([
      'Other',
      'Projects',
    ]);
  });

  it('updates the label when the allowlist renamed the root', async () => {
    const repository = build();

    await repository.record(use(owner, root, 'Projects'));
    await repository.record(use(owner, root, 'Renamed'));

    expect((await repository.findByUser(owner))[0]?.label).toBe('Renamed');
  });

  it('stores instants with a zone and reads them back in UTC', async () => {
    const repository = build();
    await repository.record(use(owner, root, 'Projects', new Date('2026-09-18T23:45:12.000Z')));

    expect((await repository.findByUser(owner))[0]?.lastUsedAt.toISOString()).toBe(
      '2026-09-18T23:45:12.000Z',
    );
  });

  it('stamps the update instant from the clock, not from the database', async () => {
    clock.set(new Date('2026-09-18T18:00:00.000Z'));
    await build().record(use());

    const rows = await connection.db.execute<{ updated_at: string }>(
      sql`SELECT to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM "workspaces"`,
    );

    expect(rows.rows[0]?.updated_at).toBe('2026-09-18T18:00:00Z');
  });

  it('logs both queries with their parameterised SQL and a duration', async () => {
    const repository = build();

    await repository.record(use());
    await repository.findByUser(owner);

    const queries = log.withOp('db.query');
    expect(queries.map((line) => line['operation'])).toEqual([
      'workspace.record',
      'workspace.findByUser',
    ]);
    expect(queries[0]).toMatchObject({ durationMs: expect.any(Number) });
    expect(String(queries[1]?.['sql'])).toContain('$1');
    expect(JSON.stringify(queries)).not.toContain('/srv/projects');
  });
});
