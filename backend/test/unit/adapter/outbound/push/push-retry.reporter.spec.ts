import { describe, expect, it } from 'vitest';

import { loggingRetryReporter } from '@adapter/outbound/push/push-retry.reporter';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

describe('loggingRetryReporter — S-48', () => {
  it('says a message was given up on, once, with the attempts', () => {
    const log = new RecordingLogger();

    loggingRetryReporter(log.logger).exhausted({
      requestId: 'req-1',
      deviceId: 'dev_1',
      kind: 'permissionRequested',
      attempts: 3,
      reason: 'attempts',
    });

    expect(log.withOp('push.send')).toEqual([
      expect.objectContaining({
        level: 'warn',
        requestId: 'req-1',
        attempts: 3,
        reason: 'attempts',
      }),
    ]);
  });

  it('says a retry failed, with the error', () => {
    const log = new RecordingLogger();

    loggingRetryReporter(log.logger).failed(new Error('down'), 'req-1');

    expect(log.withOp('push.send')).toEqual([
      expect.objectContaining({ level: 'warn', requestId: 'req-1' }),
    ]);
  });
});
