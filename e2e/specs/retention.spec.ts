import { expect, test } from '@playwright/test';
import pg from 'pg';

import { environment } from '../fixtures/environment';
import { plantEntries, purge } from '../fixtures/retention';

/**
 * The retention purge of plan 03, F3, through the door a person uses: `pnpm db purge` (B-18).
 *
 * The rows are planted, not produced: no door of the product writes a row ninety days old, because
 * every writer stamps the present. Planting them is the setup; the purge is the subject, and it is
 * reached exactly as somebody at the terminal reaches it — the script, its exit code and what it
 * prints (S-89, S-40, S-91).
 *
 * The stack's own purge job is switched off for this run, or it would race the command for the
 * same rows and the same lock at a moment that depends on the machine. Serial for the same reason:
 * the trigger the failure case installs refuses **every** purge of that table while it exists.
 */
test.describe.configure({ mode: 'serial' });

let pool: pg.Pool;
let tag = '';
let planted = 0;

test.beforeAll(() => {
  pool = new pg.Pool({ connectionString: environment.databaseUrl });
});

test.afterAll(async () => {
  await pool.query('DROP TRIGGER IF EXISTS "e2e_refuse_purge" ON "audit_events"');
  await pool.end();
});

test.beforeEach(() => {
  planted += 1;
  tag = `e2e-retention-${String(Date.now())}-${String(planted)}`;
});

/** Account events, `daysAgo` old each. */
async function plantEvents(...daysAgo: number[]): Promise<void> {
  for (const [index, days] of daysAgo.entries()) {
    await pool.query(
      `INSERT INTO "audit_events" ("id", "user_id", "kind", "subject_id", "subject_label", "at")
       VALUES ($1, 'e2e|retention', 'device.approved', $2, 'e2e phone', now() - make_interval(days => $3))`,
      [`${tag}-event-${String(index)}`, tag, days],
    );
  }
}

/** How many of this test's rows are left in a table. */
async function left(table: 'audit_entries' | 'audit_events'): Promise<number> {
  const column = table === 'audit_entries' ? 'session_id' : 'subject_id';
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS "count" FROM "${table}" WHERE "${column}" = $1`,
    [tag],
  );
  return Number(result.rows[0]?.count ?? '0');
}

test('the purge removes what is past the window, keeps the rest, and says so — S-89', async () => {
  await plantEntries(pool, tag, 400, 200, 91, 30, 1);
  await plantEvents(120, 10);

  const result = purge(environment.databaseUrl);

  expect(result.code, result.stdout).toBe(0);
  expect(result.stdout).toContain('tool invocations: 3 removed');
  expect(result.stdout).toContain('account events: 1 removed');
  expect(await left('audit_entries')).toBe(2);
  expect(await left('audit_events')).toBe(1);

  const recorded = await pool.query<{ triggered_by: string; deleted: number }>(
    `SELECT "triggered_by", "deleted" FROM "audit_purges" ORDER BY "seq" DESC LIMIT 2`,
  );
  expect(recorded.rows).toEqual([
    { triggered_by: 'cli', deleted: 1 },
    { triggered_by: 'cli', deleted: 3 },
  ]);
});

test('a purge that is refused exits non-zero and says what it could not remove — S-40', async () => {
  await plantEntries(pool, tag, 200);
  await plantEvents(200, 150);
  await pool.query(
    `CREATE OR REPLACE FUNCTION "e2e_refuse_purge"() RETURNS trigger AS $$
     BEGIN RAISE EXCEPTION 'refused by the e2e suite'; END; $$ LANGUAGE plpgsql`,
  );
  await pool.query(
    `CREATE TRIGGER "e2e_refuse_purge" BEFORE DELETE ON "audit_events"
     FOR EACH ROW EXECUTE FUNCTION "e2e_refuse_purge"()`,
  );

  try {
    const result = purge(environment.databaseUrl);

    expect(result.code, result.stdout).toBe(1);
    expect(result.stdout).toContain('tool invocations: 1 removed');
    expect(result.stdout).toContain('account events: 0 removed, then refused');
    expect(result.stdout).toContain('refused by the e2e suite');
    expect(result.stdout).toContain('removes nothing twice');
    // What it said it removed is what it removed; what it could not is still there.
    expect(await left('audit_entries')).toBe(0);
    expect(await left('audit_events')).toBe(2);
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS "e2e_refuse_purge" ON "audit_events"');
  }

  // And running it again, with the refusal gone, finishes the job.
  const again = purge(environment.databaseUrl);
  expect(again.code, again.stdout).toBe(0);
  expect(await left('audit_events')).toBe(0);
});

test('a purge that cannot reach the database exits non-zero and says nothing went — S-91', () => {
  const result = purge('postgresql://nobody:nothing@127.0.0.1:1/none');

  expect(result.code, result.stdout).toBe(1);
  expect(result.stdout).toContain('the purge could not start');
  expect(result.stdout).toContain('nothing was removed');
});
