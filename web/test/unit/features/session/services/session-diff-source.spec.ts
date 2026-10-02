import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION_DIFF_READER } from '@/features/session/services/session-diff-source';
import { api } from '@/shared/api/api';

afterEach(() => {
  vi.restoreAllMocks();
});

const key = (side: Record<string, unknown>) =>
  JSON.stringify({ sessionId: 's1', path: '/srv/app/a.ts', ...side });

describe('where the editor reads the sides of a session’s diff — plan 08, B-27', () => {
  it('reads both sides of a tool’s diff', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      before: { state: 'absent' },
      after: { state: 'content', content: 'new' },
    });

    expect(
      await SESSION_DIFF_READER.read('/srv/app', key({ toolUseId: 't1', side: 'before' })),
    ).toBe('');
    expect(
      await SESSION_DIFF_READER.read('/srv/app', key({ toolUseId: 't1', side: 'after' })),
    ).toBe('new');
  });

  it('reads both sides of a file of the changes', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      before: { state: 'content', content: 'old' },
      now: { state: 'content', content: 'now' },
    });

    expect(await SESSION_DIFF_READER.read('/srv/app', key({ side: 'before' }))).toBe('old');
    expect(await SESSION_DIFF_READER.read('/srv/app', key({ side: 'after' }))).toBe('now');
    expect(get).toHaveBeenCalledWith('/sessions/s1/changes/file?path=%2Fsrv%2Fapp%2Fa.ts');
  });

  it('refuses a side nobody knows, and a key it did not make', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      before: { state: 'notRestorable', reason: 'tooLarge' },
    });

    await expect(
      SESSION_DIFF_READER.read('/srv/app', key({ side: 'before' })),
    ).rejects.toMatchObject({
      messageKey: 'sessions.diff.sideUnknown',
    });
    await expect(SESSION_DIFF_READER.read('/srv/app', 'garbage')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
