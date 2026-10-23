import { describe, expect, it, vi } from 'vitest';

import { AppError } from '@/shared/api/errors';
import { settledBatch } from '@/shared/lib/settled-batch';

const A = { id: 'a', name: 'alpha' };
const B = { id: 'b', name: 'bravo' };

describe('settledBatch', () => {
  it('runs every item, reporting each outcome on its own — S-134', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const errorOf = vi.fn();

    const results = await settledBatch([A, B], run, errorOf);

    expect(run).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { ...A, ok: true },
      { ...B, ok: true },
    ]);
    expect(errorOf).not.toHaveBeenCalled();
  });

  it('a failure on one item never stops the others, and is mapped through errorOf', async () => {
    const failure = new AppError('FORBIDDEN', 'common.error.forbidden', 't1');
    const run = vi.fn((item: { id: string }) =>
      item.id === 'a' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined),
    );
    const errorOf = vi.fn().mockReturnValue(failure);

    const results = await settledBatch([A, B], run, errorOf);

    expect(results).toEqual([
      { ...A, ok: false, error: failure },
      { ...B, ok: true },
    ]);
    expect(errorOf).toHaveBeenCalledWith(new Error('boom'));
  });

  it('an empty batch runs nothing and answers nothing', async () => {
    const run = vi.fn();
    expect(await settledBatch([], run, vi.fn())).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
