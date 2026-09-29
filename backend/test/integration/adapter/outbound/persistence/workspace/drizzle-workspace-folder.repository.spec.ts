import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleWorkspaceFolderRepository } from '@adapter/outbound/persistence/workspace/drizzle-workspace-folder.repository';
import type { FolderVisit } from '@application/workspace';
import { UserId } from '@domain/auth';
import {
  OpenFoldersLimitReachedError,
  OpenFoldersOrderConflictError,
  WorkspacePath,
} from '@domain/workspace';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const root = WorkspacePath.create('/srv/projects');
const at = new Date('2026-09-28T12:00:00.000Z');
const limits = { openFolders: 3, recentFolders: 4 };

const folder = (name: string) => WorkspacePath.create(`/srv/projects/${name}`);
const visit = (name: string, overrides: Partial<FolderVisit> = {}): FolderVisit => ({
  userId: owner,
  path: folder(name),
  root,
  at,
  ...overrides,
});
const later = (minutes: number) => new Date(at.getTime() + minutes * 60_000);

/**
 * `workspace_folders` against a real PostgreSQL: the constraints, the upsert and — the part no fake
 * can prove — that the advisory lock makes the ceiling hold when two openings race (plan 06, B-09).
 */
describe('DrizzleWorkspaceFolderRepository', () => {
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
    await connection.db.execute(sql`TRUNCATE TABLE "workspace_folders"`);
  });

  const build = () => new DrizzleWorkspaceFolderRepository(aPersistenceContext(connection.db));
  const pathsOf = async (user = owner) =>
    (await build().findByUser(user)).map((f) => f.path.value).sort();

  it('opens a folder in a new tab, recent and unpinned', async () => {
    const opened = await build().open(visit('a'), limits);

    expect(opened.created).toBe(true);
    expect((await build().findByUser(owner))[0]?.snapshot()).toMatchObject({
      lastOpenedAt: at,
      pinned: false,
      tabPosition: 0,
      root,
    });
  });

  it('keeps one row for a folder opened twice, at the later instant — S-35, S-41', async () => {
    await build().open(visit('a'), limits);
    const again = await build().open(visit('a', { at: later(5) }), limits);

    expect(again.created).toBe(false);
    const rows = await build().findByUser(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastOpenedAt).toEqual(later(5));
  });

  it('keeps a pin through a later opening', async () => {
    await build().open(visit('a'), limits);
    await build().pin(owner, folder('a'), true);
    await build().close(owner, folder('a'));

    const reopened = await build().open(visit('a', { at: later(1) }), limits);

    expect(reopened.folder.pinned).toBe(true);
  });

  it('refuses a tab past the ceiling and writes nothing — S-43', async () => {
    for (const name of ['a', 'b', 'c']) {
      await build().open(visit(name), limits);
    }

    await expect(build().open(visit('d'), limits)).rejects.toThrow(OpenFoldersLimitReachedError);
    expect(await pathsOf()).not.toContain('/srv/projects/d');
  });

  it('keeps one row when the same folder is opened at the same moment — S-46', async () => {
    const results = await Promise.all([
      build().open(visit('a'), limits),
      build().open(visit('a'), limits),
      build().open(visit('a'), limits),
    ]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await pathsOf()).toEqual(['/srv/projects/a']);
  });

  it('lets no race pass the ceiling', async () => {
    await build().open(visit('a'), limits);
    await build().open(visit('b'), limits);

    const outcomes = await Promise.allSettled([
      build().open(visit('c'), limits),
      build().open(visit('d'), limits),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect((await build().findByUser(owner)).filter((f) => f.isOpen)).toHaveLength(3);
  });

  it('lets the oldest unpinned recent folder go past the ceiling — S-38', async () => {
    for (const [index, name] of ['a', 'b', 'c', 'd', 'e'].entries()) {
      await build().open(visit(name, { at: later(index) }), limits);
      await build().close(owner, folder(name));
    }

    expect(await pathsOf()).toEqual([
      '/srv/projects/b',
      '/srv/projects/c',
      '/srv/projects/d',
      '/srv/projects/e',
    ]);
  });

  it('closes a tab, and forgets with it a folder already off the recent list', async () => {
    await build().open(visit('a'), limits);
    await build().open(visit('b'), limits);
    await build().forget(owner, folder('b'));

    await build().close(owner, folder('a'));
    await build().close(owner, folder('b'));

    const rows = await build().findByUser(owner);
    expect(rows.map((f) => [f.path.value, f.isOpen])).toEqual([['/srv/projects/a', false]]);
  });

  it('closes a tab that is not open without a word — S-42', async () => {
    await expect(build().close(owner, folder('a'))).resolves.toBeUndefined();
  });

  it('reorders the open tabs, and refuses another set — S-44', async () => {
    await build().open(visit('a'), limits);
    await build().open(visit('b'), limits);

    await build().reorder(owner, [folder('b'), folder('a')]);
    const tabs = (await build().findByUser(owner))
      .filter((f) => f.isOpen)
      .sort((x, y) => Number(x.tabPosition) - Number(y.tabPosition));

    expect(tabs.map((f) => f.path.value)).toEqual(['/srv/projects/b', '/srv/projects/a']);
    await expect(build().reorder(owner, [folder('a')])).rejects.toThrow(
      OpenFoldersOrderConflictError,
    );
  });

  it('pins only a folder on the recent list, and pinning twice changes nothing — S-39', async () => {
    await build().open(visit('a'), limits);
    await build().pin(owner, folder('a'), true);
    await build().pin(owner, folder('a'), true);
    await build().pin(owner, folder('gone'), true);

    expect((await build().findByUser(owner)).map((f) => [f.path.value, f.pinned])).toEqual([
      ['/srv/projects/a', true],
    ]);
  });

  it('forgets a closed folder entirely, and keeps an open one as a tab only — S-40', async () => {
    await build().open(visit('a'), limits);
    await build().close(owner, folder('a'));
    await build().open(visit('b'), limits);
    await build().pin(owner, folder('b'), true);

    await build().forget(owner, folder('a'));
    await build().forget(owner, folder('b'));
    await build().forget(owner, folder('never'));

    const rows = await build().findByUser(owner);
    expect(rows.map((f) => f.snapshot())).toEqual([
      expect.objectContaining({ lastOpenedAt: null, pinned: false, tabPosition: 0 }),
    ]);
  });

  it('never reads or touches the folders of somebody else — S-36', async () => {
    await build().open(visit('a', { userId: stranger }), limits);

    await build().close(owner, folder('a'));
    await build().forget(owner, folder('a'));

    expect(await build().findByUser(owner)).toEqual([]);
    expect(await pathsOf(stranger)).toEqual(['/srv/projects/a']);
  });

  it('refuses in the database a row that is neither recent nor open', async () => {
    await expect(
      connection.db.execute(
        sql`INSERT INTO "workspace_folders" ("user_id", "path", "root_path") VALUES ('u', '/x', '/')`,
      ),
    ).rejects.toThrow();
  });
});
