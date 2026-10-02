import { describe, expect, it } from 'vitest';

import type { ShutdownSessionsUseCase } from '@application/session';
import { GracefulShutdown } from '@infra/lifecycle/graceful-shutdown';
import type { AppGateway } from '@infra/websocket/app.gateway';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

/** The halves, recording the order they were asked in. */
function halves(failed = 0): {
  steps: string[];
  gateway: AppGateway;
  sessions: ShutdownSessionsUseCase;
  watches: { closeAll(): Promise<number> };
} {
  const steps: string[] = [];

  const watches = {
    closeAll: () => {
      steps.push('close watchers');
      return Promise.resolve(4);
    },
  };

  const gateway = {
    stopAccepting: () => steps.push('stop accepting'),
    closeAll: () => {
      steps.push('close sockets');
      return 3;
    },
  } as unknown as AppGateway;

  const sessions = {
    announce: () => {
      steps.push('announce');
      return 2;
    },
    release: () => {
      steps.push('close subprocesses');
      return Promise.resolve({ closed: 2 - failed, failed });
    },
  } as unknown as ShutdownSessionsUseCase;

  return { steps, gateway, sessions, watches };
}

describe('GracefulShutdown — B-04', () => {
  it('keeps the order of the architecture: accept, announce, sockets and watchers, subprocesses — S-146', async () => {
    const { steps, gateway, sessions, watches } = halves();

    await new GracefulShutdown(
      gateway,
      sessions,
      new RecordingLogger().logger,
      watches,
    ).onModuleDestroy();

    expect(steps).toEqual([
      'stop accepting',
      'announce',
      'close sockets',
      'close watchers',
      'close subprocesses',
    ]);
  });

  it('runs once, however many times it is asked — S-14', async () => {
    const { steps, gateway, sessions, watches } = halves();
    const shutdown = new GracefulShutdown(gateway, sessions, new RecordingLogger().logger, watches);

    await Promise.all([shutdown.shutdown(), shutdown.shutdown()]);
    await shutdown.onModuleDestroy();

    expect(steps).toHaveLength(5);
  });

  it('says what it closed', async () => {
    const { gateway, sessions, watches } = halves();
    const log = new RecordingLogger();

    await new GracefulShutdown(gateway, sessions, log.logger, watches).shutdown();

    expect(log.withOp('server.shutdown').at(-1)).toMatchObject({
      level: 'info',
      announced: 2,
      sockets: 3,
      watchers: 4,
      closed: 2,
      failed: 0,
    });
  });

  it('warns when a subprocess did not close cleanly', async () => {
    const { gateway, sessions, watches } = halves(1);
    const log = new RecordingLogger();

    await new GracefulShutdown(gateway, sessions, log.logger, watches).shutdown();

    expect(log.withOp('server.shutdown').at(-1)).toMatchObject({ level: 'warn', failed: 1 });
  });
});
