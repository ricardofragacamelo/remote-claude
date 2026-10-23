import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzlePluginRepository } from '@adapter/outbound/engines/claude/drizzle-plugin.repository';
import { UserId } from '@domain/auth';
import type { PluginWrite } from '@application/engines/claude';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';

const USER = UserId.create('auth|plugin-owner');
const OTHER_USER = UserId.create('auth|plugin-other');
const NOW = new Date('2026-10-20T12:00:00.000Z');

function writeOf(userId: UserId, overrides: Partial<PluginWrite> = {}): PluginWrite {
  return {
    userId,
    identity: { origin: 'local', path: '/srv/projects/my-plugin', marketplace: null, commit: null },
    name: 'my-plugin',
    approvedDigest: 'digest-1',
    ...overrides,
  };
}

describe('DrizzlePluginRepository — plan 13, B-27', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;

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
    await connection.db.execute(sql`TRUNCATE TABLE "claude_plugins"`);
  });

  function repository(): DrizzlePluginRepository {
    return new DrizzlePluginRepository(aPersistenceContext(connection.db));
  }

  it('inserts a plugin and finds it by id — S-123', async () => {
    const stored = await repository().insert('plugin-1', writeOf(USER), NOW);

    expect(stored).toMatchObject({
      id: 'plugin-1',
      origin: 'local',
      path: '/srv/projects/my-plugin',
      marketplace: null,
      commit: null,
      name: 'my-plugin',
      approvedDigest: 'digest-1',
      enabled: true,
    });
    expect(stored.userId.equals(USER)).toBe(true);

    expect(await repository().findById('plugin-1')).toMatchObject({ id: 'plugin-1' });
  });

  it('answers null for an id that does not exist', async () => {
    expect(await repository().findById('nope')).toBeNull();
  });

  it('finds a plugin by its exact path, for the owner only — S-130', async () => {
    await repository().insert('plugin-1', writeOf(USER), NOW);

    expect(await repository().findByPath(USER, '/srv/projects/my-plugin')).toMatchObject({
      id: 'plugin-1',
    });
    expect(await repository().findByPath(USER, '/srv/projects/other')).toBeNull();
    expect(await repository().findByPath(OTHER_USER, '/srv/projects/my-plugin')).toBeNull();
  });

  it('refuses the same (user, path) twice — the unique index backs idempotent add', async () => {
    await repository().insert('plugin-1', writeOf(USER), NOW);
    await expect(repository().insert('plugin-2', writeOf(USER), NOW)).rejects.toThrow();
  });

  it('lets two different users store a plugin at the same path', async () => {
    await repository().insert('plugin-1', writeOf(USER), NOW);
    await expect(repository().insert('plugin-2', writeOf(OTHER_USER), NOW)).resolves.toMatchObject({
      id: 'plugin-2',
    });
  });

  it('lists only the caller’s own plugins', async () => {
    await repository().insert('plugin-1', writeOf(USER), NOW);
    await repository().insert(
      'plugin-2',
      writeOf(OTHER_USER, {
        identity: { origin: 'local', path: '/srv/projects/other', marketplace: null, commit: null },
      }),
      NOW,
    );

    const mine = await repository().listFor(USER);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.id).toBe('plugin-1');
  });

  it('toggles enabled, updating the timestamp', async () => {
    await repository().insert('plugin-1', writeOf(USER), NOW);
    const later = new Date(NOW.getTime() + 60_000);

    const toggled = await repository().setEnabled('plugin-1', false, later);

    expect(toggled.enabled).toBe(false);
    expect(toggled.updatedAt).toEqual(later);
  });

  it('deletes a plugin for good', async () => {
    await repository().insert('plugin-1', writeOf(USER), NOW);
    await repository().delete('plugin-1');
    expect(await repository().findById('plugin-1')).toBeNull();
  });

  it('deleting twice is a no-op', async () => {
    await repository().insert('plugin-1', writeOf(USER), NOW);
    await repository().delete('plugin-1');
    await expect(repository().delete('plugin-1')).resolves.toBeUndefined();
  });

  describe('insertIfAbsent — plan 13, B-47, S-207, S-208', () => {
    function marketplaceWriteOf(path: string, commit = 'c0ffee'): PluginWrite {
      return {
        userId: USER,
        identity: { origin: 'marketplace', path, marketplace: 'acme', commit },
        name: 'my-plugin',
        approvedDigest: 'digest-1',
      };
    }

    it('creates the row when nothing is at that (userId, path) yet', async () => {
      const result = await repository().insertIfAbsent(
        'mp-1',
        marketplaceWriteOf('/srv/plugins/u1/acme/my-plugin'),
        NOW,
      );

      expect(result.created).toBe(true);
      expect(result.plugin.id).toBe('mp-1');
      expect(await repository().findById('mp-1')).toMatchObject({ commit: 'c0ffee' });
    });

    it('answers the existing row, unchanged, when one is already there — S-207', async () => {
      const path = '/srv/plugins/u1/acme/my-plugin';
      await repository().insertIfAbsent('mp-1', marketplaceWriteOf(path, 'c0ffee'), NOW);

      const second = await repository().insertIfAbsent(
        'mp-2',
        marketplaceWriteOf(path, 'different-commit'),
        NOW,
      );

      expect(second.created).toBe(false);
      expect(second.plugin.id).toBe('mp-1');
      expect(second.plugin.commit).toBe('c0ffee'); // the first write stands, never overwritten
      expect(await repository().findById('mp-2')).toBeNull();
    });

    it('under two concurrent calls for the same (userId, path), exactly one row is created — S-208', async () => {
      const path = '/srv/plugins/u1/acme/race-plugin';

      const [first, second] = await Promise.all([
        repository().insertIfAbsent('race-1', marketplaceWriteOf(path), NOW),
        repository().insertIfAbsent('race-2', marketplaceWriteOf(path), NOW),
      ]);

      const createdCount = [first.created, second.created].filter(Boolean).length;
      expect(createdCount).toBe(1);
      expect(first.plugin.id).toBe(second.plugin.id);

      const rows = await connection.db.execute(
        sql`SELECT id FROM "claude_plugins" WHERE path = ${path}`,
      );
      expect(rows.rows).toHaveLength(1);
    });
  });

  describe('updateInstalled — plan 13, B-47, S-205', () => {
    it('writes a new commit and digest, and the updatedAt', async () => {
      await repository().insert(
        'mp-1',
        {
          userId: USER,
          identity: {
            origin: 'marketplace',
            path: '/srv/plugins/u1/acme/one',
            marketplace: 'acme',
            commit: 'old',
          },
          name: 'one',
          approvedDigest: 'old-digest',
        },
        NOW,
      );
      const later = new Date(NOW.getTime() + 60_000);

      const updated = await repository().updateInstalled(
        'mp-1',
        { commit: 'new-commit', approvedDigest: 'new-digest' },
        later,
      );

      expect(updated.commit).toBe('new-commit');
      expect(updated.approvedDigest).toBe('new-digest');
      expect(updated.updatedAt).toEqual(later);
    });
  });
});
