import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleMcpProjectApprovalRepository } from '@adapter/outbound/persistence/mcp/drizzle-mcp-project-approval.repository';
import { UserId } from '@domain/auth';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';

const USER = UserId.create('auth|project-mcp-owner');
const OTHER_USER = UserId.create('auth|project-mcp-other');
const ENGINE = 'claude';
const FOLDER = '/srv/projects/repo';
const NOW = new Date('2026-10-19T12:00:00.000Z');
const LATER = new Date('2026-10-19T13:00:00.000Z');

/**
 * `mcp_project_approvals`, against a real PostgreSQL (plan 13, B-24): the upsert's own
 * `ON CONFLICT DO UPDATE` is what this proves — a second decision on the same (user, engine,
 * folder, name) replaces the row in place, which a fake repository could not demonstrate honestly.
 */
describe('DrizzleMcpProjectApprovalRepository', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let repository: DrizzleMcpProjectApprovalRepository;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    await migrate(connection.pool);
    repository = new DrizzleMcpProjectApprovalRepository(aPersistenceContext(connection.db));
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  afterEach(async () => {
    await connection.db.execute(sql`TRUNCATE TABLE "mcp_project_approvals"`);
  });

  it('answers null for a decision nobody made', async () => {
    expect(await repository.findOne(USER, ENGINE, FOLDER, 'docs')).toBeNull();
  });

  it('writes a decision, and reads it back by its own key', async () => {
    const stored = await repository.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: FOLDER,
        name: 'docs',
        digest: 'd1',
        decision: 'approved',
        snapshot: null,
      },
      NOW,
    );

    expect(stored).toMatchObject({ digest: 'd1', decision: 'approved', decidedAt: NOW });
    const found = await repository.findOne(USER, ENGINE, FOLDER, 'docs');
    expect(found).toMatchObject({ digest: 'd1', decision: 'approved' });
  });

  it('replaces the row in place on a second decision — ON CONFLICT DO UPDATE', async () => {
    await repository.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: FOLDER,
        name: 'docs',
        digest: 'd1',
        decision: 'approved',
        snapshot: null,
      },
      NOW,
    );
    await repository.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: FOLDER,
        name: 'docs',
        digest: 'd2',
        decision: 'rejected',
        snapshot: null,
      },
      LATER,
    );

    const rows = await repository.listFor(USER, ENGINE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ digest: 'd2', decision: 'rejected', decidedAt: LATER });
  });

  it('lists every decision of a user across folders, never another user’s', async () => {
    await repository.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: FOLDER,
        name: 'docs',
        digest: 'd1',
        decision: 'approved',
        snapshot: null,
      },
      NOW,
    );
    await repository.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: '/srv/projects/other',
        name: 'metrics',
        digest: 'd2',
        decision: 'rejected',
        snapshot: null,
      },
      NOW,
    );
    await repository.upsert(
      {
        userId: OTHER_USER,
        engine: ENGINE,
        folderPath: FOLDER,
        name: 'docs',
        digest: 'd3',
        decision: 'approved',
        snapshot: null,
      },
      NOW,
    );

    const rows = await repository.listFor(USER, ENGINE);
    expect(rows.map((row) => row.name).sort()).toEqual(['docs', 'metrics']);
  });

  it('keeps the same name in two different folders as two different decisions', async () => {
    await repository.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: '/srv/a',
        name: 'docs',
        digest: 'd1',
        decision: 'approved',
        snapshot: null,
      },
      NOW,
    );
    await repository.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: '/srv/b',
        name: 'docs',
        digest: 'd2',
        decision: 'rejected',
        snapshot: null,
      },
      NOW,
    );

    expect((await repository.findOne(USER, ENGINE, '/srv/a', 'docs'))?.decision).toBe('approved');
    expect((await repository.findOne(USER, ENGINE, '/srv/b', 'docs'))?.decision).toBe('rejected');
  });

  describe('snapshot — plan 13, B-28, D-80', () => {
    it('round-trips a jsonb snapshot through a real column', async () => {
      await repository.upsert(
        {
          userId: USER,
          engine: ENGINE,
          folderPath: FOLDER,
          name: 'docs',
          digest: 'd1',
          decision: 'approved',
          snapshot: {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', 'server'],
            url: null,
            env: [{ name: 'TOKEN', value: '${TOKEN}' }],
            headers: [],
          },
        },
        NOW,
      );

      const found = await repository.findOne(USER, ENGINE, FOLDER, 'docs');
      expect(found?.snapshot).toEqual({
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'server'],
        url: null,
        env: [{ name: 'TOKEN', value: '${TOKEN}' }],
        headers: [],
      });
    });

    it('keeps no snapshot for a rejection', async () => {
      await repository.upsert(
        {
          userId: USER,
          engine: ENGINE,
          folderPath: FOLDER,
          name: 'docs',
          digest: 'd1',
          decision: 'rejected',
          snapshot: null,
        },
        NOW,
      );

      expect((await repository.findOne(USER, ENGINE, FOLDER, 'docs'))?.snapshot).toBeNull();
    });
  });
});
