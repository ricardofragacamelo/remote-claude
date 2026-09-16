import { describe, expect, it } from 'vitest';

import { runLogged, SLOW_QUERY_MS } from '@adapter/outbound/persistence/query-logging';
import type { LoggableQuery } from '@adapter/outbound/persistence/query-logging';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

/** A builder that describes itself and resolves after `delay` milliseconds. */
function query<T>(result: T, delay = 0): LoggableQuery<T> {
  return {
    toSQL: () => ({ sql: 'select * from "sessions" where "id" = $1', params: ['01J0'] }),
    then: (resolve) =>
      new Promise<T>((settle) => setTimeout(() => settle(result), delay)).then(resolve),
  } as LoggableQuery<T>;
}

describe('runLogged', () => {
  it('answers what the query answered', async () => {
    const log = new RecordingLogger();

    await expect(runLogged(log.logger, 'session.findById', query(['row']))).resolves.toEqual([
      'row',
    ]);
  });

  it('logs the parameterised SQL, never the values', async () => {
    const log = new RecordingLogger();

    await runLogged(log.logger, 'session.findById', query([]));

    const line = log.withOp('db.query')[0];
    expect(line).toMatchObject({ sql: 'select * from "sessions" where "id" = $1', params: 1 });
    expect(JSON.stringify(line)).not.toContain('01J0');
  });

  it('reports how long it took', async () => {
    const log = new RecordingLogger();

    await runLogged(log.logger, 'session.findById', query([]));

    expect(log.withOp('db.query')[0]?.['durationMs']).toBeTypeOf('number');
  });

  it('logs a quick query at debug', async () => {
    const log = new RecordingLogger();

    await runLogged(log.logger, 'session.findById', query([]));

    expect(log.withOp('db.query')[0]?.['level']).toBe('debug');
  });

  it('raises a slow query to warn, which is what points at a missing index', async () => {
    const log = new RecordingLogger();

    await runLogged(log.logger, 'session.findById', query([], SLOW_QUERY_MS + 40));

    expect(log.withOp('db.query')[0]?.['level']).toBe('warn');
  });
});
