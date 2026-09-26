import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PurgeAuditTrailUseCase } from '@application/audit';
import type {
  AuditPurgeReport,
  AuditRetentionSession,
  AuditRetentionStore,
  Exclusive,
} from '@application/audit';
import {
  AUDIT_PURGE_LOCK_KEY,
  DrizzleAuditRetentionStore,
} from '@adapter/outbound/persistence/audit/drizzle-audit-retention.store';
import { DrizzleAuditRepository } from '@adapter/outbound/persistence/audit/drizzle-audit.repository';
import { AuditEntry } from '@domain/audit';
import type { AuditTrail } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { waitFor } from '../../../../../support/app/wait-for';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../../support/fakes/sequential-ids';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The table behind each trail, for the SQL this suite writes by hand. */
const TABLE: Record<AuditTrail, string> = { entries: 'audit_entries', events: 'audit_events' };

/**
 * A lock a test holds to stop a purge **inside** a batch.
 *
 * A statement-level trigger on the trail waits for it after the batch's DELETE has run and before
 * it commits — so while the test holds it, the purge has deleted rows it has not committed, holds
 * their locks, and holds the purge lock. That is the instant S-38 and S-51 are about, reached on
 * purpose rather than hoped for.
 */
const GATE_KEY = 770_001;

/**
 * The purge against a real PostgreSQL.
 *
 * Real, because every guarantee under test belongs to the database: the trigger that refuses a
 * DELETE inside the floor, the statement that deletes a batch and records it or does neither, the
 * advisory lock the job and the command share, and the row locks a write to the trail must not wait
 * on. No in-memory stand-in has any of them.
 */
describe('the retention purge', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let log: RecordingLogger;
  let planted = 0;
  // One source of ids for the whole suite, as there is one for the whole process: two runs that
  // minted the same record id would have the second batch refused by the primary key.
  const ids = new SequentialIds();

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    await migrate(connection.pool);
    log = new RecordingLogger();
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  afterEach(async () => {
    await connection.pool.query('DROP TRIGGER IF EXISTS "test_purge_gate" ON "audit_entries"');
    await connection.pool.query('DROP TRIGGER IF EXISTS "test_purge_gate" ON "audit_events"');
    // The triggers refuse a DELETE inside the floor, and every one on the purge record; the suite
    // owns this database and says so by switching them off for the truncate.
    for (const table of ['audit_entries', 'audit_events', 'audit_purges']) {
      await connection.pool.query(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
      await connection.pool.query(`TRUNCATE TABLE "${table}"`);
      await connection.pool.query(`ALTER TABLE "${table}" ENABLE TRIGGER USER`);
    }
    log = new RecordingLogger();
  });

  /** The store the job and the command both use. */
  const store = (): DrizzleAuditRetentionStore =>
    new DrizzleAuditRetentionStore(connection.pool, log.logger);

  /** The purge, at a chosen instant — close to the database's own, which the trigger reads. */
  const aPurge = (
    options: {
      at?: Date;
      batchSize?: number;
      retentionDays?: number;
      over?: AuditRetentionStore;
    } = {},
  ): PurgeAuditTrailUseCase =>
    new PurgeAuditTrailUseCase(
      options.over ?? store(),
      new FixedClock(options.at ?? new Date()),
      ids,
      { retentionDays: options.retentionDays ?? 90, batchSize: options.batchSize ?? 2 },
    );

  /** Rows in a trail, written by hand: the trail's own writers stamp `at` with the present. */
  async function plant(trail: AuditTrail, ...instants: Date[]): Promise<void> {
    for (const at of instants) {
      planted += 1;
      const id = `planted-${String(planted)}`;

      if (trail === 'entries') {
        await connection.pool.query(
          `INSERT INTO "audit_entries" ("id", "user_id", "session_id", "tool_use_id", "tool_name", "input", "decision", "at")
           VALUES ($1, 'auth|owner', '01J0ABCDEFGHJKMNPQRSTVWXYZ', $1, 'Bash', '{}'::jsonb, 'recorded', $2)`,
          [id, at],
        );
      } else {
        await connection.pool.query(
          `INSERT INTO "audit_events" ("id", "user_id", "kind", "subject_id", "subject_label", "at")
           VALUES ($1, 'auth|owner', 'device.approved', 'device-1', 'Pixel', $2)`,
          [id, at],
        );
      }
    }
  }

  /** `days` before `from`. */
  const before = (from: Date, days: number): Date => new Date(from.getTime() - days * DAY_MS);

  async function remaining(trail: AuditTrail): Promise<Date[]> {
    const result = await connection.pool.query<{ at: Date }>(
      `SELECT "at" FROM "${TABLE[trail]}" ORDER BY "at"`,
    );
    return result.rows.map((row) => row.at);
  }

  interface PurgeRow {
    purge_id: string;
    triggered_by: string;
    trail: string;
    retention_days: number;
    cutoff: Date;
    deleted: number;
  }

  async function records(): Promise<PurgeRow[]> {
    const result = await connection.pool.query<PurgeRow>(
      `SELECT "purge_id", "triggered_by", "trail", "retention_days", "cutoff", "deleted"
       FROM "audit_purges" ORDER BY "seq"`,
    );
    return result.rows;
  }

  /** What the purge did, or a failed test saying it did not run. */
  function ran(report: AuditPurgeReport): Extract<AuditPurgeReport, { purgeId: string }> {
    if (report.status === 'skipped') {
      throw new Error('the purge was expected to run and was skipped');
    }
    return report;
  }

  /** The database's own reason for refusing a statement — Drizzle wraps it on `cause`. */
  function reasonOf(error: unknown): string {
    const cause = (error as { cause?: unknown }).cause;
    return String((cause as Error | undefined)?.message ?? (error as Error).message);
  }

  /** Stops every DELETE on `trail` inside its transaction until the returned `open` is called. */
  async function gate(trail: AuditTrail): Promise<{ open: () => Promise<void> }> {
    await connection.pool.query(
      `CREATE OR REPLACE FUNCTION "test_purge_gate"() RETURNS trigger AS $$
       BEGIN PERFORM pg_advisory_xact_lock(${String(GATE_KEY)}); RETURN NULL; END;
       $$ LANGUAGE plpgsql`,
    );
    await connection.pool.query(
      `CREATE TRIGGER "test_purge_gate" AFTER DELETE ON "${TABLE[trail]}"
       FOR EACH STATEMENT EXECUTE FUNCTION "test_purge_gate"()`,
    );

    const holder = await connection.pool.connect();
    await holder.query('SELECT pg_advisory_lock($1)', [GATE_KEY]);

    return {
      open: async () => {
        await holder.query('SELECT pg_advisory_unlock($1)', [GATE_KEY]);
        holder.release();
      },
    };
  }

  /** The backend of the purge that is waiting at the gate, once it is. */
  async function stoppedAtTheGate(): Promise<number> {
    const [waiting] = await waitFor(
      'a purge waiting at the gate',
      async () =>
        (
          await connection.pool.query<{ pid: number }>(
            `SELECT "pid" FROM pg_locks
             WHERE "locktype" = 'advisory' AND "objid" = $1 AND NOT "granted"`,
            [GATE_KEY],
          )
        ).rows,
      (rows) => rows.length > 0,
      10_000,
    );

    return waiting?.pid ?? -1;
  }

  /** Rejects if `promise` has not settled in time — a deadline for a fact, not a sleep. */
  async function within<T>(ms: number, what: string, promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${what} did not finish within ${String(ms)} ms`));
      }, ms);
    });

    try {
      return await Promise.race([promise, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  describe('what it removes', () => {
    it('removes what is outside the window, from both trails — S-34', async () => {
      const now = new Date();
      await plant('entries', before(now, 400), before(now, 200), before(now, 91));
      await plant('events', before(now, 120));

      const report = ran(await aPurge({ at: now }).execute('job'));

      expect(report.status).toBe('completed');
      expect(report.trails.map((trail) => trail.deleted)).toEqual([3, 1]);
      expect(await remaining('entries')).toEqual([]);
      expect(await remaining('events')).toEqual([]);
    });

    it('removes nothing inside the window — S-35', async () => {
      const now = new Date();
      const inside = [before(now, 89), before(now, 30), before(now, 0)];
      await plant('entries', ...inside);
      await plant('events', before(now, 45));

      const report = ran(await aPurge({ at: now }).execute('job'));

      expect(report.trails.map((trail) => trail.deleted)).toEqual([0, 0]);
      expect(await remaining('entries')).toEqual(inside);
      expect(await remaining('events')).toHaveLength(1);
    });

    it('keeps the entry written exactly ninety days ago, and removes the one a millisecond older — S-36', async () => {
      const now = new Date();
      const edge = before(now, 90);
      const justPast = new Date(edge.getTime() - 1);
      await plant('entries', edge, justPast);

      await aPurge({ at: now }).execute('job');

      expect(await remaining('entries')).toEqual([edge]);
    });

    it('cuts at a longer window when one is configured', async () => {
      const now = new Date();
      await plant('entries', before(now, 100), before(now, 400));

      const report = ran(await aPurge({ at: now, retentionDays: 365 }).execute('cli'));

      expect(report.trails[0]?.deleted).toBe(1);
      expect(await remaining('entries')).toEqual([before(now, 100)]);
    });

    it('works through a trail far larger than one batch', async () => {
      const now = new Date();
      await connection.pool.query(
        `INSERT INTO "audit_entries" ("id", "user_id", "session_id", "tool_use_id", "tool_name", "input", "decision", "at")
         SELECT 'bulk-' || g, 'auth|owner', 'session', 'bulk-' || g, 'Bash', '{}'::jsonb, 'recorded',
                $1::timestamptz - make_interval(days => 100, secs => g)
         FROM generate_series(1, 2500) AS g`,
        [now],
      );

      const report = ran(await aPurge({ at: now, batchSize: 1_000 }).execute('job'));

      expect(report.trails[0]?.deleted).toBe(2_500);
      expect((await records()).map((row) => row.deleted)).toEqual([1_000, 1_000, 500]);
    });
  });

  describe('its record — B-19', () => {
    it('writes one row per batch, with the run, who started it, the window and the count — S-39', async () => {
      const now = new Date();
      await plant('entries', before(now, 100), before(now, 101), before(now, 102));
      await plant('events', before(now, 100));

      const report = ran(await aPurge({ at: now }).execute('cli'));

      const cutoff = before(now, 90);
      expect(await records()).toEqual([
        {
          purge_id: report.purgeId,
          triggered_by: 'cli',
          trail: 'entries',
          retention_days: 90,
          cutoff,
          deleted: 2,
        },
        {
          purge_id: report.purgeId,
          triggered_by: 'cli',
          trail: 'entries',
          retention_days: 90,
          cutoff,
          deleted: 1,
        },
        {
          purge_id: report.purgeId,
          triggered_by: 'cli',
          trail: 'events',
          retention_days: 90,
          cutoff,
          deleted: 1,
        },
      ]);
    });

    it('leaves no row when there was nothing to remove, and a second run changes nothing — S-86', async () => {
      const now = new Date();
      await plant('entries', before(now, 10));

      await aPurge({ at: now }).execute('job');
      await aPurge({ at: now }).execute('job');

      expect(await records()).toEqual([]);
      expect(await remaining('entries')).toHaveLength(1);
    });

    it('is itself neither editable nor removable', async () => {
      const now = new Date();
      await plant('entries', before(now, 400));
      await aPurge({ at: now }).execute('job');

      await expect(
        connection.pool.query(`UPDATE "audit_purges" SET "deleted" = 0`),
      ).rejects.toThrow(/append-only: UPDATE is refused/);
      await expect(connection.pool.query(`DELETE FROM "audit_purges"`)).rejects.toThrow(
        /append-only: DELETE is refused/,
      );
      expect(await records()).toHaveLength(1);
    });

    it('refuses a record of a window below the floor', async () => {
      await expect(
        connection.pool.query(
          `INSERT INTO "audit_purges" ("id", "purge_id", "triggered_by", "trail", "retention_days", "cutoff", "deleted", "at")
           VALUES ('r', 'p', 'cli', 'entries', 89, now(), 1, now())`,
        ),
      ).rejects.toThrow(/audit_purges_retention_at_least_floor/);
    });
  });

  describe('the floor — the database, not the code', () => {
    it("refuses a DELETE typed by hand inside the window, with the application's own role — S-52", async () => {
      const now = new Date();
      await plant('entries', before(now, 30));
      await plant('events', before(now, 30));

      await expect(connection.pool.query('DELETE FROM "audit_entries"')).rejects.toThrow(
        /retained for 90 days/,
      );
      await expect(connection.pool.query('DELETE FROM "audit_events"')).rejects.toThrow(
        /retained for 90 days/,
      );
      expect(await remaining('entries')).toHaveLength(1);
      expect(await remaining('events')).toHaveLength(1);
    });

    it('refuses a batch cut inside the floor, and then neither deletes nor records it — S-85', async () => {
      // A purge with a bug in its window: the store is asked to cut at the present.
      const now = new Date();
      await plant('entries', before(now, 30), before(now, 400));

      const refused = await store()
        .exclusively((session) =>
          session.purgeBatch({
            recordId: 'record-1',
            purgeId: 'purge-1',
            triggeredBy: 'cli',
            trail: 'entries',
            retentionDays: 90,
            cutoff: now,
            limit: 10,
            at: now,
          }),
        )
        .then(
          () => 'accepted',
          (error: unknown) => reasonOf(error),
        );

      expect(refused).toContain('retained for 90 days');
      // One statement: the old row did not go without the recent one either, and nothing says it did.
      expect(await remaining('entries')).toHaveLength(2);
      expect(await records()).toEqual([]);
    });

    it('sits at 2160 hours, whatever the time zone of the session — S-88', async () => {
      const now = new Date();
      await connection.pool.query(
        `ALTER DATABASE "${database.url.split('/').pop() ?? ''}" SET timezone TO 'America/New_York'`,
      );
      const zoned = openDatabase(database.url);

      try {
        const zone = await zoned.pool.query<{ TimeZone: string }>('SHOW timezone');
        expect(zone.rows[0]?.TimeZone).toBe('America/New_York');

        await plant('entries', new Date(now.getTime() - 2_160 * HOUR_MS + 60_000));
        await expect(zoned.pool.query('DELETE FROM "audit_entries"')).rejects.toThrow(
          /retained for 90 days/,
        );

        await connection.pool.query('ALTER TABLE "audit_entries" DISABLE TRIGGER USER');
        await connection.pool.query('TRUNCATE TABLE "audit_entries"');
        await connection.pool.query('ALTER TABLE "audit_entries" ENABLE TRIGGER USER');

        await plant('entries', new Date(now.getTime() - 2_160 * HOUR_MS - 60_000));
        await expect(zoned.pool.query('DELETE FROM "audit_entries"')).resolves.toMatchObject({
          rowCount: 1,
        });
      } finally {
        await zoned.pool.end();
        await connection.pool.query(
          `ALTER DATABASE "${database.url.split('/').pop() ?? ''}" RESET timezone`,
        );
      }
    });
  });

  describe('interrupted, and run again — S-37', () => {
    it('resumes after a run that stopped between batches, and removes nothing twice', async () => {
      const now = new Date();
      await plant('entries', ...[100, 101, 102, 103, 104].map((days) => before(now, days)));

      /** The real store, whose third batch never happens. */
      const interrupting: AuditRetentionStore = {
        exclusively: <T>(
          work: (session: AuditRetentionSession) => Promise<T>,
        ): Promise<Exclusive<T>> =>
          store().exclusively((session) => {
            let batches = 0;
            return work({
              purgeBatch: (batch) => {
                batches += 1;
                return batches > 2
                  ? Promise.reject(new Error('the process was stopped'))
                  : session.purgeBatch(batch);
              },
            });
          }),
      };

      const first = ran(await aPurge({ at: now, over: interrupting }).execute('job'));
      const second = ran(await aPurge({ at: now }).execute('job'));

      expect(first.status).toBe('failed');
      expect(first.trails[0]).toMatchObject({ deleted: 4, failure: { error: expect.any(Error) } });
      expect(second.status).toBe('completed');
      expect(second.trails[0]?.deleted).toBe(1);
      expect(await remaining('entries')).toEqual([]);
      const rows = await records();
      expect(rows.reduce((sum, row) => sum + row.deleted, 0)).toBe(5);
      expect(new Set(rows.map((row) => row.purge_id))).toEqual(
        new Set([first.purgeId, second.purgeId]),
      );
    });

    it('loses no batch when the connection dies inside one', async () => {
      const now = new Date();
      await plant('entries', before(now, 100), before(now, 101), before(now, 102));
      await plant('events', before(now, 100));
      const closed = await gate('entries');

      const first = aPurge({ at: now, batchSize: 10 }).execute('job');
      const pid = await stoppedAtTheGate();
      await connection.pool.query('SELECT pg_terminate_backend($1)', [pid]);
      const interrupted = ran(await first);
      await closed.open();

      // The batch in flight rolled back with its record: nothing went, and nothing says it did.
      expect(interrupted.status).toBe('failed');
      expect(interrupted.trails.map((trail) => trail.deleted)).toEqual([0, 0]);
      expect(await remaining('entries')).toHaveLength(3);
      expect(await records()).toEqual([]);
      expect(log.withOp('audit.purge.connection').length).toBeGreaterThan(0);

      const second = ran(await aPurge({ at: now, batchSize: 10 }).execute('job'));

      expect(second.status).toBe('completed');
      expect(second.trails.map((trail) => trail.deleted)).toEqual([3, 1]);
      expect((await records()).reduce((sum, row) => sum + row.deleted, 0)).toBe(4);
    });
  });

  describe('beside everything else', () => {
    it('does not hold up a write to the trail while a batch is in flight — S-38', async () => {
      const now = new Date();
      await plant('entries', before(now, 100), before(now, 101), before(now, 102));
      const closed = await gate('entries');

      const purging = aPurge({ at: now, batchSize: 10 }).execute('job');
      await stoppedAtTheGate();

      // Rows deleted and not committed, their locks held, the purge lock held: and yet the trail
      // takes a new entry — which is what the authorisation of the next tool is waiting for.
      await within(
        5_000,
        'a write to the trail during the purge',
        new DrizzleAuditRepository(aPersistenceContext(connection.db)).append(
          AuditEntry.record({
            id: '01J0AUDIT0000000000000NEW1',
            userId: UserId.create('auth|owner'),
            sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
            toolUseId: 'tu-during-purge',
            toolName: 'Bash',
            input: { command: 'git status' },
            decision: 'recorded',
            origin: { deviceId: null, ip: null },
            at: new Date(),
          }),
        ),
      );

      await closed.open();
      const report = ran(await purging);

      expect(report.trails[0]?.deleted).toBe(3);
      expect(await remaining('entries')).toHaveLength(1);
    });

    it('lets one of two simultaneous purges run, and the other leave at once with nothing done — S-51', async () => {
      const now = new Date();
      await plant('entries', before(now, 100), before(now, 101), before(now, 102));
      const closed = await gate('entries');

      const byTheJob = aPurge({ at: now, batchSize: 10 }).execute('job');
      await stoppedAtTheGate();
      const byHand = await within(5_000, 'the second purge', aPurge({ at: now }).execute('cli'));
      await closed.open();
      const first = ran(await byTheJob);

      expect(byHand).toMatchObject({
        status: 'skipped',
        reason: 'alreadyRunning',
        triggeredBy: 'cli',
      });
      expect(first.trails[0]?.deleted).toBe(3);
      const rows = await records();
      expect(rows.map((row) => row.triggered_by)).toEqual(['job']);
      expect(rows.reduce((sum, row) => sum + row.deleted, 0)).toBe(3);
    });

    it('gives the lock back, so the next purge can run', async () => {
      const now = new Date();
      await aPurge({ at: now }).execute('job');

      // One connection for both statements: a session lock is released by the session holding it.
      const client = await connection.pool.connect();
      try {
        const lock = await client.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_lock($1) AS "acquired"',
          [AUDIT_PURGE_LOCK_KEY],
        );
        await client.query('SELECT pg_advisory_unlock($1)', [AUDIT_PURGE_LOCK_KEY]);

        expect(lock.rows[0]?.acquired).toBe(true);
      } finally {
        client.release();
      }
    });

    it('logs each of its statements at debug, parameterised', async () => {
      await aPurge().execute('job');

      expect(log.withOp('db.query').map((line) => line['operation'])).toEqual([
        'audit.purge.lock',
        'audit.purge.entries',
        'audit.purge.events',
        'audit.purge.unlock',
      ]);
      expect(log.withOp('db.query').every((line) => line.level === 'debug')).toBe(true);
    });
  });
});
