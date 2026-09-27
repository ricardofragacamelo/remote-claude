import { describe, expect, it } from 'vitest';

import { machineMemoryBytes, sessionRegistryFor } from '@infra/lifecycle/session-capacity';
import { aClock } from '../../../support/builders/session.builder';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

const GB = 1024 ** 3;

describe('machineMemoryBytes', () => {
  it('is the machine when there is no container limit', () => {
    expect(machineMemoryBytes(16 * GB, 0)).toBe(16 * GB);
  });

  it('is the container limit when it is smaller', () => {
    expect(machineMemoryBytes(16 * GB, 2 * GB)).toBe(2 * GB);
  });

  it('is the machine when the container limit is "unlimited"', () => {
    expect(machineMemoryBytes(16 * GB, 2 ** 62)).toBe(16 * GB);
  });

  it('reads this machine when told nothing', () => {
    expect(machineMemoryBytes()).toBeGreaterThan(0);
  });
});

describe('sessionRegistryFor — D-01', () => {
  const config = {
    session: {
      capacity: { floor: 1, ceiling: 10, memoryFraction: 0.5, perSessionBytes: 256 * 1024 ** 2 },
      idleTtlMs: 1_800_000,
      limits: { maxBudgetUsd: 10, maxTurns: 100 },
      defaults: { model: 'claude-sonnet-5', permissionMode: 'default' as const },
    },
  };

  it('builds the registry with the capacity of the machine — S-01', () => {
    const log = new RecordingLogger();

    expect(sessionRegistryFor(config, 2 * GB, aClock(), log.logger).capacity).toBe(4);
  });

  it('says the capacity out loud, with what it came from', () => {
    const log = new RecordingLogger();

    sessionRegistryFor(config, 2 * GB, aClock(), log.logger);

    expect(log.withOp('session.capacity')).toEqual([
      expect.objectContaining({
        level: 'info',
        limit: 4,
        memoryBytes: 2 * GB,
        floor: 1,
        ceiling: 10,
      }),
    ]);
  });
});
