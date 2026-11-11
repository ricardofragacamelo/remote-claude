import { describe, expect, it } from 'vitest';

import { isEmptyTrail, simulationRequestOf } from '@/features/permission/lib/simulation-input';
import type { RuleSimulation } from '@/features/permission/types/rule';

describe('simulationRequestOf — assembling a simulate request (plan 15, B-29, D-15)', () => {
  it('sends only the limit when nothing else was given', () => {
    expect(simulationRequestOf({ limit: 200 })).toEqual({ limit: 200 });
  });

  it('carries `add` along, when given', () => {
    const add = [{ pattern: 'shell(git status)', decision: 'allow' as const }];
    expect(simulationRequestOf({ add, limit: 200 })).toEqual({ add, limit: 200 });
  });

  it('leaves `add` out entirely when not given', () => {
    const input = simulationRequestOf({ limit: 200 });
    expect(input).not.toHaveProperty('add');
  });

  it('carries `remove` along, when given', () => {
    expect(simulationRequestOf({ remove: ['rule_1', 'rule_2'], limit: 50 })).toEqual({
      remove: ['rule_1', 'rule_2'],
      limit: 50,
    });
  });

  it('leaves `remove` out entirely when not given', () => {
    const input = simulationRequestOf({ limit: 200 });
    expect(input).not.toHaveProperty('remove');
  });

  it('carries `folder` along, when given', () => {
    expect(simulationRequestOf({ folder: '/srv/app', limit: 1000 })).toEqual({
      folder: '/srv/app',
      limit: 1000,
    });
  });

  it('leaves `folder` out entirely when not given', () => {
    const input = simulationRequestOf({ limit: 200 });
    expect(input).not.toHaveProperty('folder');
  });

  it('carries add, folder and limit all together', () => {
    const add = [{ pattern: 'shell(git status)', decision: 'deny' as const }];
    expect(simulationRequestOf({ add, folder: '/srv/app', limit: 1000 })).toEqual({
      add,
      folder: '/srv/app',
      limit: 1000,
    });
  });
});

function aSimulation(overrides: Partial<RuleSimulation> = {}): RuleSimulation {
  return {
    counts: { unchanged: 0, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 0 },
    changes: [],
    withoutFolder: 0,
    assumedMode: 'ask',
    ...overrides,
  };
}

describe('isEmptyTrail — nothing read at all (plan 15, B-29, S-200)', () => {
  it('is true when every count and withoutFolder are all zero', () => {
    expect(isEmptyTrail(aSimulation())).toBe(true);
  });

  it('is false when unchanged alone is non-zero', () => {
    expect(
      isEmptyTrail(
        aSimulation({ counts: { unchanged: 1, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 0 } }),
      ),
    ).toBe(false);
  });

  it('is false when wouldAutoAllow alone is non-zero', () => {
    expect(
      isEmptyTrail(
        aSimulation({ counts: { unchanged: 0, wouldAutoAllow: 1, wouldAutoDeny: 0, wouldAsk: 0 } }),
      ),
    ).toBe(false);
  });

  it('is false when wouldAutoDeny alone is non-zero', () => {
    expect(
      isEmptyTrail(
        aSimulation({ counts: { unchanged: 0, wouldAutoAllow: 0, wouldAutoDeny: 1, wouldAsk: 0 } }),
      ),
    ).toBe(false);
  });

  it('is false when wouldAsk alone is non-zero', () => {
    expect(
      isEmptyTrail(
        aSimulation({ counts: { unchanged: 0, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 1 } }),
      ),
    ).toBe(false);
  });

  it('is false when withoutFolder alone is non-zero', () => {
    expect(isEmptyTrail(aSimulation({ withoutFolder: 1 }))).toBe(false);
  });
});
