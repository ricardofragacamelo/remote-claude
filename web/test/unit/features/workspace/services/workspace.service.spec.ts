import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/api';
import { fetchWorkspaces } from '@/features/workspace/services/workspace.service';

describe('fetchWorkspaces', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the one endpoint there is', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ workspaces: [] });

    await fetchWorkspaces();

    expect(get).toHaveBeenCalledWith('/workspaces');
  });

  it('unwraps the envelope, so nothing above it knows the response has one', async () => {
    const workspace = { path: '/srv/projects', label: 'Projects', lastUsedAt: null };
    vi.spyOn(api, 'get').mockResolvedValue({ workspaces: [workspace] });

    expect(await fetchWorkspaces()).toEqual([workspace]);
  });

  it('answers an empty list when the installation allows this user nothing', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ workspaces: [] });

    expect(await fetchWorkspaces()).toEqual([]);
  });

  it('lets the failure through, already translated into an app error by the client', async () => {
    const failure = { code: 'FORBIDDEN', messageKey: 'common.error.forbidden', traceId: 't' };
    vi.spyOn(api, 'get').mockRejectedValue(failure);

    await expect(fetchWorkspaces()).rejects.toBe(failure);
  });
});
