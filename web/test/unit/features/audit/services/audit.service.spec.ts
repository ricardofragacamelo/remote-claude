import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAuditPage } from '@/features/audit/services/audit.service';
import { api } from '@/shared/api/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchAuditPage', () => {
  it('asks for the top of the whole trail when nothing is filtered', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });

    await fetchAuditPage({}, null);

    expect(get).toHaveBeenCalledWith('/audit-entries');
  });

  it('sends every filter and the cursor, in one fixed order', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });

    await fetchAuditPage(
      {
        to: '2026-09-02T00:00:00.000Z',
        decision: 'allowed',
        sessionId: 'S1',
        toolName: 'Bash',
        from: '2026-09-01T00:00:00.000Z',
      },
      '120',
    );

    expect(get).toHaveBeenCalledWith(
      '/audit-entries?sessionId=S1&toolName=Bash&decision=allowed&from=2026-09-01T00%3A00%3A00.000Z&to=2026-09-02T00%3A00%3A00.000Z&cursor=120',
    );
  });

  it('drops an empty filter rather than sending it', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });

    await fetchAuditPage({ toolName: '' }, null);

    expect(get).toHaveBeenCalledWith('/audit-entries');
  });

  it('escapes what it sends, so a filter cannot add a parameter of its own', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });

    await fetchAuditPage({ toolName: 'Bash&cursor=1' }, null);

    expect(get).toHaveBeenCalledWith('/audit-entries?toolName=Bash%26cursor%3D1');
  });

  it('hands the page back as the server sent it', async () => {
    const page = { entries: [{ id: 'e1' }], nextCursor: '7' };
    vi.spyOn(api, 'get').mockResolvedValue(page);

    expect(await fetchAuditPage({}, null)).toBe(page);
  });

  it('lets the failure through, already an app error', async () => {
    const failure = { code: 'FORBIDDEN', messageKey: 'audit.error.forbidden', traceId: 't' };
    vi.spyOn(api, 'get').mockRejectedValue(failure);

    await expect(fetchAuditPage({ sessionId: 'S2' }, null)).rejects.toBe(failure);
  });
});
