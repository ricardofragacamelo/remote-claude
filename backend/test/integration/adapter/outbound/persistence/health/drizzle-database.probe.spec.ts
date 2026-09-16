import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleDatabaseProbe } from '@adapter/outbound/persistence/health/drizzle-database.probe';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

describe('DrizzleDatabaseProbe', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  it('reports the database reachable', async () => {
    const probe = new DrizzleDatabaseProbe(connection.db, new RecordingLogger().logger);

    await expect(probe.isReachable()).resolves.toBe(true);
  });

  it('answers false rather than throwing when nothing is listening', async () => {
    const dead = openDatabase('postgresql://nobody:nobody@127.0.0.1:1/none');
    const log = new RecordingLogger();

    await expect(new DrizzleDatabaseProbe(dead.db, log.logger).isReachable()).resolves.toBe(false);

    expect(log.lines.some((line) => line['level'] === 'error')).toBe(true);
    await dead.pool.end();
  });
});
