import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema';

/** The Drizzle client, typed over the whole schema. */
export type Database = NodePgDatabase<typeof schema>;

/** An open pool and the client on top of it. */
export interface DatabaseConnection {
  readonly pool: pg.Pool;
  readonly db: Database;
}

/**
 * Opens the pool.
 *
 * `min: 0` so an idle process holds nothing, an explicit `max` so a leak cannot exhaust the
 * server, and a `statement_timeout` because a query left hanging takes the whole pool with it.
 * See docs/architecture/backend/05-persistence.md#conexão-e-pool.
 */
export function openDatabase(url: string): DatabaseConnection {
  const pool = new pg.Pool({
    connectionString: url,
    min: 0,
    max: 10,
    statement_timeout: 10_000,
    idleTimeoutMillis: 10_000,
  });

  return { pool, db: drizzle(pool, { schema }) };
}
