import { describe, expect, it } from 'vitest';

import { createRootLogger } from '@shared/logging/logger';
import { REDACTED } from '@shared/logging/redact';
import { runWithTrace } from '@shared/logging/trace-context';

/** A logger writing into an array, so a test can read the log the way an operator would. */
function capturing(level = 'debug'): {
  log: ReturnType<typeof createRootLogger>;
  lines: Record<string, unknown>[];
} {
  const lines: Record<string, unknown>[] = [];
  const log = createRootLogger(
    { level, service: 'backend' },
    {
      write: (line: string) => {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );

  return { log, lines };
}

describe('createRootLogger', () => {
  it('writes to stdout when it is given no destination, which is how it runs in production', () => {
    const log = createRootLogger({ level: 'silent', service: 'backend' });

    expect(log.level).toBe('silent');
    expect(() => {
      log.info({ op: 'test' }, 'quiet');
    }).not.toThrow();
  });

  it('stamps the service on every line', () => {
    const { log, lines } = capturing();

    log.info({ op: 'test' }, 'something happened');

    expect(lines[0]).toMatchObject({ service: 'backend', op: 'test', msg: 'something happened' });
  });

  it('writes the level as its name, not as a number', () => {
    const { log, lines } = capturing();

    log.warn({ op: 'test' }, 'careful');

    expect(lines[0]?.['level']).toBe('warn');
  });

  it('timestamps in ISO 8601, in UTC', () => {
    const { log, lines } = capturing();

    log.info({ op: 'test' }, 'now');

    expect(String(lines[0]?.['time'])).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('adds the trace of the operation in flight, without being handed it', () => {
    const { log, lines } = capturing();

    runWithTrace({ traceId: 'trace-42' }, () => {
      log.info({ op: 'test' }, 'inside');
    });

    expect(lines[0]?.['traceId']).toBe('trace-42');
  });

  it('leaves the trace out when there is no operation in flight', () => {
    const { log, lines } = capturing();

    log.info({ op: 'test' }, 'outside');

    expect(lines[0]).not.toHaveProperty('traceId');
  });

  it('never writes an Authorization header, even when handed one', () => {
    const { log, lines } = capturing();

    log.debug({ op: 'http.request', req: { headers: { authorization: 'Bearer secret' } } }, 'in');

    expect(JSON.stringify(lines[0])).not.toContain('secret');
    expect(lines[0]).toMatchObject({ req: { headers: { authorization: REDACTED } } });
  });

  it('never writes a Cookie header', () => {
    const { log, lines } = capturing();

    log.debug({ op: 'http.request', req: { headers: { cookie: 'rc_refresh=secret' } } }, 'in');

    expect(JSON.stringify(lines[0])).not.toContain('secret');
  });

  it('honours the level it was configured with', () => {
    const { log, lines } = capturing('warn');

    log.debug({ op: 'test' }, 'quiet');
    log.warn({ op: 'test' }, 'loud');

    expect(lines).toHaveLength(1);
    expect(lines[0]?.['msg']).toBe('loud');
  });
});
