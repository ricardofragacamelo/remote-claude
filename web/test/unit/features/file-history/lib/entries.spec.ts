import { describe, expect, it, vi } from 'vitest';

import {
  asHistoryError,
  authorOf,
  restoreOrder,
  whenOf,
} from '@/features/file-history/lib/entries';
import { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';

describe('what the Timeline says of an entry — plan 07, B-59', () => {
  it('says "you" for a version of the person asking, and the start of somebody else’s id (S-350)', () => {
    expect(authorOf({ self: true, id: 'auth0|me' })).toEqual({
      key: 'fileHistory.author.self',
      params: {},
    });
    expect(authorOf({ self: false, id: '0123456789abcdef' })).toEqual({
      key: 'fileHistory.author.other',
      params: { id: '01234567' },
    });
  });

  it('says when, in the person’s language', () => {
    const at = '2026-10-01T10:00:00.000Z';

    expect(whenOf(at, 'en')).toBe(
      new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(at),
      ),
    );
    expect(whenOf(at, 'pt-BR')).not.toBe(whenOf(at, 'en'));
  });

  it('restores folders before what is inside them — by depth, folders first at one depth', () => {
    const order = restoreOrder([
      { id: '4', path: 'src/lib/b.ts', entryKind: 'file' },
      { id: '2', path: 'src/a.ts', entryKind: 'file' },
      { id: '3', path: 'src/lib', entryKind: 'directory' },
      { id: '1', path: 'src', entryKind: 'directory' },
      { id: '5', path: 'z.ts', entryKind: 'file' },
    ]);

    expect(order.map((entry) => entry.path)).toEqual([
      'src',
      'z.ts',
      'src/lib',
      'src/a.ts',
      'src/lib/b.ts',
    ]);
  });

  it('keeps the server’s refusal, and tells an unexpected failure as one, in the log', () => {
    const refusal = new AppError('FILE_CHANGED', 'files.error.changed', 't');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    expect(asHistoryError(refusal)).toBe(refusal);
    expect(asHistoryError(new Error('boom'))).toMatchObject({
      code: 'INTERNAL_ERROR',
      messageKey: 'common.error.unexpected',
    });
    expect(warn).toHaveBeenCalledWith(
      { op: 'fileHistory.request', err: 'Error: boom' },
      'local history request failed',
    );
    warn.mockRestore();
  });
});
