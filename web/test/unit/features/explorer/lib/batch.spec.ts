import { describe, expect, it } from 'vitest';

import { asExplorerError, intoItself, runEach } from '@/features/explorer/lib/batch';
import { AppError } from '@/shared/api/errors';

describe('a batch of operations — S-182, S-183', () => {
  it('acts on each in turn, and says how each went', async () => {
    const order: string[] = [];
    const refusal = new AppError('FILE_EXISTS', 'files.error.exists', 't-1');

    const results = await runEach(
      ['a', 'b', 'c'],
      (item) => `${item}.ts`,
      async (item) => {
        order.push(item);
        if (item === 'b') {
          throw refusal;
        }
      },
    );

    expect(order).toEqual(['a', 'b', 'c']);
    expect(results).toEqual([
      { path: 'a.ts', ok: true },
      { path: 'b.ts', ok: false, error: refusal },
      { path: 'c.ts', ok: true },
    ]);
  });

  it('calls anything that is not the server answer unexpected', () => {
    const error = asExplorerError(new TypeError('boom'));

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.messageKey).toBe('common.error.unexpected');
  });

  it('refuses a destination that is one of the entries, or inside one', () => {
    expect(intoItself(['src', 'b.ts'], 'src/deep')).toBe(true);
    expect(intoItself(['src'], 'src')).toBe(true);
    expect(intoItself(['src'], 'lib')).toBe(false);
    expect(intoItself(['src'], '')).toBe(false);
  });
});
