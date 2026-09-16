import { describe, expect, it } from 'vitest';

import { currentTraceId, runWithTrace } from '@shared/logging/trace-context';

describe('trace context', () => {
  it('is empty outside an operation', () => {
    expect(currentTraceId()).toBeNull();
  });

  it('carries the trace through the callback', () => {
    const seen = runWithTrace({ traceId: 'trace-1' }, () => currentTraceId());

    expect(seen).toBe('trace-1');
  });

  it('survives an await inside the callback', async () => {
    const seen = await runWithTrace({ traceId: 'trace-2' }, async () => {
      await Promise.resolve();
      return currentTraceId();
    });

    expect(seen).toBe('trace-2');
  });

  it('keeps two concurrent operations from borrowing each other’s trace', async () => {
    const operation = (traceId: string, delay: number): Promise<string | null> =>
      runWithTrace({ traceId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return currentTraceId();
      });

    const [first, second] = await Promise.all([operation('a', 20), operation('b', 1)]);

    expect(first).toBe('a');
    expect(second).toBe('b');
  });

  it('is empty again once the operation ends', () => {
    runWithTrace({ traceId: 'trace-3' }, () => currentTraceId());

    expect(currentTraceId()).toBeNull();
  });
});
