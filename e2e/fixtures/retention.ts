import path from 'node:path';
import { spawnSync } from 'node:child_process';

import pg from 'pg';

/**
 * `pnpm db purge`, the way somebody at the terminal runs it — the script, its exit code and what it
 * prints. The retention spec proves the command; the isolation spec proves what it must leave
 * alone. One copy, so the two never run different commands under the same name.
 */

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

/** What the command did: its exit code and everything it printed. */
export interface PurgeRun {
  readonly code: number;
  readonly stdout: string;
}

/** Runs `pnpm db purge` against a database, with only the variables the command reads. */
export function purge(databaseUrl: string): PurgeRun {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'db.mjs'), 'purge'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      NO_COLOR: '1',
      DATABASE_URL: databaseUrl,
      LOG_LEVEL: 'warn',
      RC_AUDIT_RETENTION_DAYS: '90',
    },
  });

  return { code: result.status ?? 1, stdout: result.stdout };
}

/**
 * Plants entries of the trail, `daysAgo` old each, in a session named `tag`.
 *
 * Planted, not produced: no door of the product writes a row ninety days old, because every writer
 * stamps the present. Planting them is the setup; the purge is always the subject.
 */
export async function plantEntries(
  pool: pg.Pool,
  tag: string,
  ...daysAgo: number[]
): Promise<void> {
  for (const [index, days] of daysAgo.entries()) {
    const id = `${tag}-entry-${String(index)}`;
    await pool.query(
      `INSERT INTO "audit_entries" ("id", "user_id", "session_id", "tool_use_id", "tool_name", "input", "decision", "at")
       VALUES ($1, 'e2e|retention', $2, $1, 'Bash', '{}'::jsonb, 'recorded', now() - make_interval(days => $3))`,
      [id, tag, days],
    );
  }
}

/**
 * Runs `use` with a connection pool to a database, and closes it whatever happened.
 *
 * Per case, not per spec: a pool that outlived its spec would hold the connections the purge needs.
 */
export async function withDatabase<T>(
  databaseUrl: string,
  use: (pool: pg.Pool) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    return await use(pool);
  } finally {
    await pool.end();
  }
}

/** How many rows a `SELECT count(*) AS "count" …` found. */
export function countRows(databaseUrl: string, query: string, params: unknown[]): Promise<number> {
  return withDatabase(databaseUrl, async (pool) => {
    const result = await pool.query<{ count: string }>(query, params);
    return Number(result.rows[0]?.count ?? '0');
  });
}
