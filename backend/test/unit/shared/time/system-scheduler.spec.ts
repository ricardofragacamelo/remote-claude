import { describe, expect, it } from 'vitest';

import { SystemScheduler } from '@shared/time/system-scheduler';

describe('SystemScheduler', () => {
  it('runs the task after the delay', async () => {
    const ran: string[] = [];
    new SystemScheduler().after(1, () => ran.push('fired'));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(ran).toEqual(['fired']);
  });

  it('never runs it synchronously, even for a delay already past', async () => {
    // Settling a request before its caller has finished creating it would be a resolution
    // arriving before the question.
    const ran: string[] = [];
    new SystemScheduler().after(-1_000, () => ran.push('fired'));

    expect(ran).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ran).toEqual(['fired']);
  });

  it('cancels a task that has not run yet', async () => {
    const ran: string[] = [];
    const cancel = new SystemScheduler().after(5, () => ran.push('fired'));

    cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(ran).toEqual([]);
  });

  it('is safe to cancel twice, and after the task has run', async () => {
    const cancel = new SystemScheduler().after(1, () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(() => {
      cancel();
      cancel();
    }).not.toThrow();
  });
});
