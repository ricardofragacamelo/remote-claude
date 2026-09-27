import { describe, expect, it } from 'vitest';

import { createLogger, defaultLevel } from '@/shared/logging/logger';

describe('defaultLevel', () => {
  it.each([
    ['test', true, 'silent'],
    ['test', false, 'silent'],
    ['development', true, 'debug'],
    ['production', false, 'info'],
  ])('is %s/%s → %s', (mode, isDevelopment, expected) => {
    expect(defaultLevel(mode, isDevelopment)).toBe(expected);
  });
});

describe('createLogger', () => {
  it('stamps the service and the build on every line', () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger(
      { level: 'debug', appVersion: '1.2.3' },
      { write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) },
    );

    log.info({ op: 'test' }, 'something happened');

    expect(lines[0]).toMatchObject({ service: 'web', appVersion: '1.2.3', op: 'test' });
  });

  it('writes the level as its name', () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger(
      { level: 'debug', appVersion: '1' },
      { write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) },
    );

    log.warn({ op: 'test' }, 'careful');

    expect(lines[0]?.['level']).toBe('warn');
  });

  it('can be built without a destination', () => {
    expect(createLogger({ level: 'silent', appVersion: '1' }).level).toBe('silent');
  });
});
