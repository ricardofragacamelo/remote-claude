import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleAuditRepository } from '@adapter/outbound/persistence/audit/drizzle-audit.repository';
import { DrizzleAuditTrailReader } from '@adapter/outbound/persistence/audit/drizzle-audit-trail.reader';
import type { AuditTrailPageRequest } from '@application/audit';
import { AuditEntry } from '@domain/audit';
import type { AuditDecision } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';
import { runWithTrace } from '@shared/logging/trace-context';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const session = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const otherSession = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY1');
const strangerSession = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY2');
const empty = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY3');

const T0 = new Date('2026-09-20T10:00:00.000Z');
const minutes = (n: number): Date => new Date(T0.getTime() + n * 60_000);

/**
 * The trail, read back from a real PostgreSQL — plan 03, F2.
 *
 * Against a real one because every promise here is the database's: the keyset over `seq` that
 * neither repeats nor skips a row while the table grows, the half-open period, and the plan the
 * planner picks for a query over a trail that has stopped being small.
 */
describe('reading the audit trail', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let log: RecordingLogger;
  let written = 0;

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
    // The trigger refuses a DELETE inside the retention floor; the suite owns this database.
    await connection.db.execute(sql`ALTER TABLE "audit_entries" DISABLE TRIGGER USER`);
    await connection.db.execute(sql`TRUNCATE TABLE "audit_entries"`);
    await connection.db.execute(sql`ALTER TABLE "audit_entries" ENABLE TRIGGER USER`);
    log = new RecordingLogger();
  });

  const context = () => aPersistenceContext(connection.db, { logger: log.logger });
  const reader = (): DrizzleAuditTrailReader => new DrizzleAuditTrailReader(context());
  const writer = (): DrizzleAuditRepository => new DrizzleAuditRepository(context());

  interface Written {
    readonly userId?: UserId;
    readonly sessionId?: SessionId;
    readonly toolName?: string;
    readonly decision?: AuditDecision;
    readonly at?: Date;
  }

  /** Writes one entry through the real writer, and answers its id. */
  async function write(overrides: Written = {}): Promise<string> {
    written += 1;
    const id = `01J0AUDIT${String(written).padStart(17, '0')}`;
    const decision = overrides.decision ?? 'recorded';

    await writer().append(
      AuditEntry.record({
        id,
        userId: overrides.userId ?? owner,
        sessionId: overrides.sessionId ?? session,
        toolUseId: `tu-${String(written)}`,
        toolName: overrides.toolName ?? 'Bash',
        input: { command: `step ${String(written)}` },
        decision,
        origin: { deviceId: null, ip: null },
        at: overrides.at ?? T0,
        verdict:
          decision === 'recorded'
            ? null
            : {
                requestId: `req-${String(written)}`,
                auto: false,
                ruleId: null,
                scope: 'once',
                resolvedBy: overrides.userId ?? owner,
                resolvedFrom: 'web',
              },
      }),
    );

    return id;
  }

  async function writeMany(count: number, overrides: Written = {}): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push(await write(overrides));
    }
    return ids;
  }

  const request = (overrides: Partial<AuditTrailPageRequest> = {}): AuditTrailPageRequest => ({
    userId: owner,
    sessionId: null,
    toolName: null,
    decision: null,
    from: null,
    to: null,
    before: null,
    limit: 50,
    ...overrides,
  });

  /** The ids of one page, newest first. */
  async function ids(overrides: Partial<AuditTrailPageRequest> = {}): Promise<string[]> {
    return (await reader().page(request(overrides))).records.map(({ entry }) => entry.id);
  }

  /** Every page of a query, cursor after cursor, until the last. */
  async function everyPage(
    overrides: Partial<AuditTrailPageRequest>,
    between: () => Promise<void> = () => Promise.resolve(),
  ): Promise<string[]> {
    const seen: string[] = [];
    let before: number | null = null;

    for (let guard = 0; guard < 100; guard += 1) {
      const page = await reader().page(request({ ...overrides, before }));
      seen.push(...page.records.map(({ entry }) => entry.id));

      if (page.nextCursor === null) {
        return seen;
      }

      before = page.nextCursor;
      await between();
    }

    throw new Error('the pages never ended');
  }

  it('reads the caller`s entries, newest first', async () => {
    const [first, second, third] = await writeMany(3);

    expect(await ids()).toEqual([third, second, first]);
  });

  it('never hands back another person`s entry — S-26', async () => {
    const mine = await write();
    await write({ userId: stranger, sessionId: strangerSession });

    expect(await ids()).toEqual([mine]);
  });

  it('reads one session and nothing of the others — S-23', async () => {
    const inSession = await writeMany(2);
    await writeMany(2, { sessionId: otherSession });

    expect(await ids({ sessionId: session })).toEqual([...inSession].reverse());
  });

  it('includes the entry on the start of the period and excludes the one on its end — S-24', async () => {
    await write({ at: minutes(-1) });
    const onStart = await write({ at: minutes(0) });
    const inside = await write({ at: minutes(5) });
    await write({ at: minutes(10) });

    expect(await ids({ from: minutes(0), to: minutes(10) })).toEqual([inside, onStart]);
  });

  it('reads a period open on either side', async () => {
    const before = await write({ at: minutes(-5) });
    const after = await write({ at: minutes(5) });

    expect(await ids({ to: minutes(0) })).toEqual([before]);
    expect(await ids({ from: minutes(0) })).toEqual([after]);
  });

  it('orders by the sequence, not by the clock — D-06', async () => {
    // Written later with an earlier `at`: a clock set back. It still comes first, because it was
    // written last — which is what "newest" means for somebody paging the trail.
    const early = await write({ at: minutes(10) });
    const setBack = await write({ at: minutes(-10) });

    expect(await ids()).toEqual([setBack, early]);
  });

  it('crosses tool, decision and period, and returns only what satisfies all three — S-72', async () => {
    await write({ toolName: 'Bash', decision: 'recorded', at: minutes(1) });
    const hit = await write({ toolName: 'Bash', decision: 'allowed', at: minutes(1) });
    await write({ toolName: 'Write', decision: 'allowed', at: minutes(1) });
    await write({ toolName: 'Bash', decision: 'allowed', at: minutes(30) });

    expect(
      await ids({ toolName: 'Bash', decision: 'allowed', from: minutes(0), to: minutes(10) }),
    ).toEqual([hit]);
  });

  it('pages with a cursor that neither repeats nor skips, while the trail grows — S-25', async () => {
    const original = await writeMany(10);

    // Between every page, two more entries land — exactly what happens while somebody reads the
    // trail of a session that is still running.
    const seen = await everyPage({ limit: 3 }, async () => {
      await writeMany(2);
    });

    expect(seen).toEqual([...original].reverse());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('pages cleanly with writes landing at the same time, not only between pages — S-25', async () => {
    const original = await writeMany(12);

    const [seen] = await Promise.all([
      everyPage({ limit: 4 }),
      Promise.all(Array.from({ length: 8 }, () => write())),
    ]);

    // Whatever was written meanwhile may or may not be on the first page — it lands **above** the
    // window — but nothing of the original is missing or repeated.
    const originalSeen = seen.filter((id) => original.includes(id));
    expect(originalSeen).toEqual([...original].reverse());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('answers the same query with the same page, every time — S-29', async () => {
    await writeMany(6);
    const top = await reader().page(request({ limit: 2 }));
    const cursor = top.nextCursor;

    const once = await reader().page(request({ limit: 2, before: cursor }));
    const again = await reader().page(request({ limit: 2, before: cursor }));

    expect(again).toEqual(once);
    expect(await reader().page(request({ limit: 2 }))).toEqual(top);
  });

  it('says there is no next page when exactly `limit` entries are left — S-71', async () => {
    await writeMany(3);

    const page = await reader().page(request({ limit: 3 }));

    expect(page.records).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('hands a cursor to the one entry past the page, and then none — S-71', async () => {
    const [oldest] = await writeMany(4);

    const first = await reader().page(request({ limit: 3 }));
    expect(first.nextCursor).toBe(first.records.at(-1)?.seq);

    const last = await reader().page(request({ limit: 3, before: first.nextCursor }));
    expect(last.records.map(({ entry }) => entry.id)).toEqual([oldest]);
    expect(last.nextCursor).toBeNull();
  });

  it('reads an empty trail as an empty last page', async () => {
    expect(await reader().page(request())).toEqual({ records: [], nextCursor: null });
  });

  it('reads back the verdict and the trace an entry was written with — S-30, S-31', async () => {
    await runWithTrace({ traceId: 'trace-r' }, () =>
      writer().append(
        AuditEntry.record({
          id: '01J0AUDIT00000000000000R1',
          userId: owner,
          sessionId: session,
          toolUseId: 'tu-r',
          toolName: 'Bash',
          input: { command: 'git status' },
          decision: 'allowed',
          origin: { deviceId: null, ip: null },
          at: T0,
          verdict: {
            requestId: 'req-r',
            auto: true,
            ruleId: 'rule-r',
            scope: 'always',
            resolvedBy: owner,
            resolvedFrom: null,
          },
        }),
      ),
    );

    const [record] = (await reader().page(request())).records;

    expect(record?.traceId).toBe('trace-r');
    expect(record?.entry.verdict).toMatchObject({ auto: true, ruleId: 'rule-r', scope: 'always' });
  });

  describe('whose a session is', () => {
    it('is mine when an entry of it is mine', async () => {
      await write();

      expect(await reader().ownershipOf(session, owner)).toBe('mine');
    });

    it('is somebody else`s when it has entries and none are mine — S-26', async () => {
      await write({ userId: stranger, sessionId: strangerSession });

      expect(await reader().ownershipOf(strangerSession, owner)).toBe('others');
    });

    it('is nobody`s when it has no entry at all — S-73', async () => {
      await write();

      expect(await reader().ownershipOf(empty, owner)).toBe('none');
    });
  });

  describe('the plan the database picks — S-28, B-14', () => {
    /**
     * A trail that has stopped being small: two people, a hundred sessions, forty thousand rows —
     * enough that a sequential scan is what the planner would pick if the indexes did not serve.
     */
    async function aBigTrail(): Promise<void> {
      await connection.db.execute(sql`
        INSERT INTO "audit_entries" ("id", "user_id", "session_id", "tool_name", "input", "decision", "at")
        SELECT
          'BIG' || lpad(n::text, 23, '0'),
          CASE WHEN n % 2 = 0 THEN ${owner.value} ELSE ${stranger.value} END,
          '01J0SESS' || lpad((n % 100)::text, 18, '0'),
          CASE WHEN n % 3 = 0 THEN 'Read' ELSE 'Bash' END,
          '{}'::jsonb,
          CASE WHEN n % 5 = 0 THEN 'allowed' ELSE 'recorded' END,
          ${T0.toISOString()}::timestamptz - (n || ' seconds')::interval
        FROM generate_series(1, 40000) AS n
      `);
      await connection.db.execute(sql`ANALYZE "audit_entries"`);
    }

    /** The SQL the reader really ran for a page, as its query log recorded it. */
    function lastPageSql(): string {
      const line = log.lines.filter((entry) => entry['operation'] === 'audit.page').at(-1);
      return String(line?.['sql']);
    }

    /** Every node of a JSON plan, flattened. */
    function nodesOf(plan: Record<string, unknown>): Record<string, unknown>[] {
      const children = (plan['Plans'] as Record<string, unknown>[] | undefined) ?? [];
      return [plan, ...children.flatMap(nodesOf)];
    }

    async function planOf(
      statement: string,
      params: unknown[],
    ): Promise<Record<string, unknown>[]> {
      const result = await connection.pool.query<{
        'QUERY PLAN': { Plan: Record<string, unknown> }[];
      }>(`EXPLAIN (FORMAT JSON) ${statement}`, params);
      const [explained] = result.rows[0]?.['QUERY PLAN'] ?? [];
      if (explained === undefined) {
        throw new Error('no plan');
      }
      return nodesOf(explained.Plan);
    }

    const scans = (nodes: readonly Record<string, unknown>[]) =>
      nodes.filter((node) => node['Relation Name'] === 'audit_entries');

    it('walks the owner`s index for a broad filter, and never scans the table', async () => {
      await aBigTrail();
      await reader().page(request({ from: minutes(-1_000), to: minutes(1) }));

      // Parameters in the order the reader binds them: owner, from, to, limit.
      const nodes = await planOf(lastPageSql(), [
        owner.value,
        minutes(-1_000).toISOString(),
        minutes(1).toISOString(),
        51,
      ]);

      expect(scans(nodes).map((node) => node['Node Type'])).not.toContain('Seq Scan');
      expect(scans(nodes).map((node) => node['Index Name'])).toContain(
        'audit_entries_user_id_seq_idx',
      );
      // Already in order: the index hands rows over by `seq`, so there is nothing to sort.
      expect(nodes.map((node) => node['Node Type'])).not.toContain('Sort');
    });

    it('walks the owner`s index past a cursor, still without a sort', async () => {
      await aBigTrail();
      await reader().page(request({ toolName: 'Bash', before: 30_000 }));

      const nodes = await planOf(lastPageSql(), [owner.value, 'Bash', 30_000, 51]);

      expect(scans(nodes).map((node) => node['Index Name'])).toContain(
        'audit_entries_user_id_seq_idx',
      );
      expect(scans(nodes).map((node) => node['Node Type'])).not.toContain('Seq Scan');
      expect(nodes.map((node) => node['Node Type'])).not.toContain('Sort');
    });

    it('walks the session`s index when a session is asked for', async () => {
      await aBigTrail();
      const target = SessionId.create('01J0SESS000000000000000042');
      await reader().page(request({ sessionId: target }));

      const nodes = await planOf(lastPageSql(), [owner.value, target.value, 51]);

      expect(scans(nodes).map((node) => node['Node Type'])).not.toContain('Seq Scan');
      expect(scans(nodes).map((node) => node['Index Name'])).toContain(
        'audit_entries_session_id_seq_idx',
      );
    });
  });
});
