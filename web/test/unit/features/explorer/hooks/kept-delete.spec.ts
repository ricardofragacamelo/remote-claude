import { afterEach, describe, expect, it, vi } from 'vitest';

import { keptRound, notifyKept } from '@/features/explorer/hooks/kept-delete';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { onNotify } from '@/shared/lib/notify';
import type { Notification } from '@/shared/lib/notify';

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
});

function refusal(code: string, params: Record<string, unknown> = {}): AppError {
  return new AppError(code, 'files.error.x', 't', params);
}

describe('a delete kept in the local history, entry by entry — plan 07, B-58', () => {
  it('reads each answer: kept, not kept and why, the second step, or a failure', async () => {
    const entries = [{ id: 'h-1', path: 'a.ts', entryKind: 'file' }];
    vi.spyOn(api, 'delete')
      .mockResolvedValueOnce({ kept: { batchId: 'b', entries } })
      .mockRejectedValueOnce(refusal('DIRECTORY_NOT_EMPTY', { entryCount: 3, notKept: 'tooMany' }))
      .mockRejectedValueOnce(refusal('DIRECTORY_NOT_EMPTY', { entryCount: 3 }))
      .mockRejectedValueOnce(
        refusal('PRECONDITION_REQUIRED', { reason: 'notKept', why: 'tooLarge' }),
      )
      .mockRejectedValueOnce(refusal('PRECONDITION_REQUIRED', { reason: 'sensitiveFile' }))
      .mockRejectedValueOnce(refusal('PRECONDITION_REQUIRED', { reason: 'expectedEntriesMissing' }))
      .mockRejectedValueOnce(refusal('FILE_NOT_FOUND'));

    const round = await keptRound(
      APP,
      ['a.ts', 'many', 'old', 'big', '.mcp.json', 'odd', 'gone'],
      false,
    );

    expect(round.kept).toEqual([{ path: 'a.ts', entries }]);
    expect(round.notKept).toEqual([
      { path: 'many', why: 'tooMany' },
      { path: 'old', why: 'unavailable' },
      { path: 'big', why: 'tooLarge' },
    ]);
    expect(round.sensitive).toEqual(['.mcp.json']);
    expect(round.failed.map((each) => each.path)).toEqual(['odd', 'gone']);
  });

  it('tells one entry by its name, many by their count, and undoes once', () => {
    const told: Notification[] = [];
    const stop = onNotify((notification) => told.push(notification));
    const undo = vi.fn();

    notifyKept(['src/lib/a.ts'], undo);
    notifyKept(['a.ts', 'b.ts'], vi.fn());
    told[0]?.actions?.[0]?.run();
    told[0]?.actions?.[0]?.run();
    stop();

    expect(told[0]).toMatchObject({
      severity: 'info',
      messageKey: 'notification.files.deletedOne',
      params: { name: 'a.ts' },
    });
    expect(told[1]).toMatchObject({
      messageKey: 'notification.files.deletedMany',
      params: { count: 2 },
    });
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
