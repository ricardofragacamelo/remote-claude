import { describe, expect, it } from 'vitest';

import { NestLoggerBridge } from '@shared/logging/nest-logger';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

describe('NestLoggerBridge', () => {
  it.each([
    ['log', 'info'],
    ['warn', 'warn'],
    ['debug', 'debug'],
    ['verbose', 'trace'],
  ] as const)('writes a %s message at %s, in the shared field schema', (method, level) => {
    const log = new RecordingLogger();

    new NestLoggerBridge(log.logger)[method]('routes mapped', 'RouterExplorer');

    expect(log.lines[0]).toMatchObject({
      level,
      op: 'nest',
      nestContext: 'RouterExplorer',
      msg: 'routes mapped',
    });
  });

  it('keeps the stack of an error out of the message', () => {
    const log = new RecordingLogger();

    new NestLoggerBridge(log.logger).error('boom', 'at main.ts:1', 'NestApplication');

    expect(log.lines[0]).toMatchObject({ level: 'error', stack: 'at main.ts:1', msg: 'boom' });
  });

  it.each([
    ['an object', { route: '/health' }, '{"route":"/health"}'],
    ['nothing at all', undefined, ''],
  ])('renders a context that is %s', (_case, context, expected) => {
    const log = new RecordingLogger();

    new NestLoggerBridge(log.logger).log('message', context);

    expect(log.lines[0]?.['nestContext']).toBe(expected);
  });
});
