import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleNotificationHistoryRepository } from '@adapter/outbound/persistence/notification/drizzle-notification-history.repository';
import { UserId } from '@domain/auth';
import { NotificationEntry } from '@domain/notification';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { SequentialIds } from '../../../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const at = new Date('2026-09-28T12:00:00.000Z');

/**
 * `notifications` against a real PostgreSQL: the unique client id, the ceiling kept inside the
 * recording's transaction — even when two recordings race — and the purge boundary (plan 06, B-40).
 */
describe('DrizzleNotificationHistoryRepository', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  const ids = new SequentialIds();

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
    await connection.db.execute(sql`TRUNCATE TABLE "notifications"`);
  });

  const build = () => new DrizzleNotificationHistoryRepository(aPersistenceContext(connection.db));

  function entry(
    clientId: string,
    overrides: { userId?: UserId; createdAt?: Date } = {},
  ): NotificationEntry {
    return NotificationEntry.record(
      {
        userId: overrides.userId ?? owner,
        clientId,
        severity: 'info',
        messageKey: 'notification.folder.notAllowed',
        params: { folder: '/srv/projects/app' },
        count: 1,
      },
      ids.next(),
      overrides.createdAt ?? at,
    );
  }

  async function countOf(user: UserId): Promise<number> {
    const rows = await connection.db.execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM "notifications" WHERE "user_id" = ${user.value}`,
    );
    return Number(rows.rows[0]?.count);
  }

  it('keeps an entry and reads it back whole', async () => {
    const kept = entry('a');
    await build().record(kept, 200);

    const page = await build().page(owner, null, 50);

    expect(page.entries.map((each) => each.snapshot())).toEqual([kept.snapshot()]);
    expect(page.unread).toBe(1);
  });

  it('answers the entry already kept for a client id, and keeps one — S-169', async () => {
    const first = await build().record(entry('a'), 200);
    const again = await build().record(entry('a'), 200);

    expect(again).toMatchObject({ created: false });
    expect(again.entry.id).toBe(first.entry.id);
    expect(await countOf(owner)).toBe(1);
  });

  it('lets the oldest go when a new one passes the ceiling — S-170', async () => {
    for (const clientId of ['a', 'b', 'c', 'd']) {
      await build().record(entry(clientId), 3);
    }

    const page = await build().page(owner, null, 50);

    expect(page.entries.map((each) => each.clientId)).toEqual(['d', 'c', 'b']);
  });

  it('never leaves a user past the ceiling when recordings race — S-176', async () => {
    for (const clientId of ['a', 'b', 'c']) {
      await build().record(entry(clientId), 3);
    }

    await Promise.all(['x', 'y', 'z', 'w'].map((clientId) => build().record(entry(clientId), 3)));

    expect(await countOf(owner)).toBe(3);
  });

  it('counts the ceiling per user', async () => {
    await build().record(entry('a', { userId: stranger }), 1);
    await build().record(entry('b'), 1);

    expect(await countOf(stranger)).toBe(1);
    expect(await countOf(owner)).toBe(1);
  });

  it('pages newest first, and the cursor leads to the rest', async () => {
    for (const clientId of ['a', 'b', 'c']) {
      await build().record(entry(clientId), 200);
    }

    const first = await build().page(owner, null, 2);
    const second = await build().page(owner, first.nextCursor, 2);

    expect(first.entries.map((each) => each.clientId)).toEqual(['c', 'b']);
    expect(second.entries.map((each) => each.clientId)).toEqual(['a']);
    expect(second.nextCursor).toBeNull();
  });

  it('marks read what is named and unread, and never what is somebody else’s — S-168, S-172', async () => {
    const mine = await build().record(entry('a'), 200);
    const theirs = await build().record(entry('b', { userId: stranger }), 200);
    const read = new Date('2026-09-28T13:00:00.000Z');

    await build().markRead(owner, [mine.entry.id, theirs.entry.id, 'not-there'], read);
    await build().markRead(owner, [mine.entry.id], new Date('2026-09-28T14:00:00.000Z'));
    await build().markRead(owner, [], read);

    expect((await build().page(owner, null, 50)).entries[0]?.readAt).toEqual(read);
    expect((await build().page(stranger, null, 50)).unread).toBe(1);
  });

  it('marks every entry of a user read, and the count of unread falls — S-173', async () => {
    await build().record(entry('a'), 200);
    await build().record(entry('b'), 200);

    await build().markAllRead(owner, at);

    expect((await build().page(owner, null, 50)).unread).toBe(0);
  });

  it('deletes one entry and clears the rest, only the user’s — S-177', async () => {
    const doomed = await build().record(entry('a'), 200);
    await build().record(entry('b'), 200);
    await build().record(entry('c', { userId: stranger }), 200);

    await build().remove(stranger, doomed.entry.id);
    expect(await countOf(owner)).toBe(2);

    await build().remove(owner, doomed.entry.id);
    expect(await countOf(owner)).toBe(1);

    await build().clear(owner);
    expect(await countOf(owner)).toBe(0);
    expect(await countOf(stranger)).toBe(1);
  });

  it('purges what was created before the cutoff, and nothing after it — S-171', async () => {
    const cutoff = new Date('2026-08-29T12:00:00.000Z');
    await build().record(entry('old', { createdAt: new Date(cutoff.getTime() - 1_000) }), 200);
    await build().record(entry('new', { createdAt: new Date(cutoff.getTime() + 1_000) }), 200);

    expect(await build().purgeCreatedBefore(cutoff)).toBe(1);
    expect((await build().page(owner, null, 50)).entries.map((each) => each.clientId)).toEqual([
      'new',
    ]);
  });

  it('refuses in the database a severity nobody knows', async () => {
    await expect(
      connection.db.execute(
        sql`INSERT INTO "notifications" ("id", "user_id", "client_id", "severity", "message_key", "params", "count", "created_at")
            VALUES ('x', 'u', 'c', 'loud', 'k.k', '{}', 1, now())`,
      ),
    ).rejects.toThrow();
  });
});
