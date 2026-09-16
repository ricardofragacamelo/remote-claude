import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/** A PostgreSQL that exists for the length of one suite. */
export interface DisposablePostgres {
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Starts PostgreSQL 18 in a container.
 *
 * Never SQLite and never a mock: an in-memory database lies about transactions, constraints,
 * types, collation and concurrency, and a test that passes there and fails on PostgreSQL is worse
 * than no test — see docs/architecture/shared/00-decisions.md (ADR-004).
 *
 * One container per **suite**: starting one costs seconds, and per-test isolation comes from the
 * data each test sets up, not from a fresh server.
 */
export async function startPostgres(): Promise<DisposablePostgres> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:18-alpine',
  ).start();

  return {
    url: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}
