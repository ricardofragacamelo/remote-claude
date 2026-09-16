import { describe, expect, it } from 'vitest';

import { CheckHealthUseCase } from '@application/health';
import type { DatabaseProbe } from '@application/health';

const probe = (reachable: boolean): DatabaseProbe => ({
  isReachable: () => Promise.resolve(reachable),
});

describe('CheckHealthUseCase', () => {
  it('reports up when the database answers', async () => {
    await expect(new CheckHealthUseCase(probe(true)).execute()).resolves.toEqual({
      status: 'up',
      database: 'up',
    });
  });

  it('reports down when it does not', async () => {
    await expect(new CheckHealthUseCase(probe(false)).execute()).resolves.toEqual({
      status: 'down',
      database: 'down',
    });
  });
});
