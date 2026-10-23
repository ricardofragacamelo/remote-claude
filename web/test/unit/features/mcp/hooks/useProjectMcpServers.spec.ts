import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useProjectMcpServers } from '@/features/mcp/hooks/useProjectMcpServers';
import { api } from '@/shared/api/api';
import { providers } from '../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useProjectMcpServers — plan 13, B-24, B-28', () => {
  it('reads nothing, and asks nothing of the server, while no folder is in view', () => {
    const get = vi.spyOn(api, 'get');
    const { result } = renderHook(() => useProjectMcpServers('claude', undefined), {
      wrapper: providers(),
    });

    expect(result.current.servers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('climbs from the folder once it is given', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ servers: [{ name: 'docs' }], errors: [] });

    const { result } = renderHook(() => useProjectMcpServers('claude', '/srv/app'), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.servers).toEqual([{ name: 'docs' }]);
    });
    expect(get).toHaveBeenCalledWith('/engines/claude/project-mcp-approvals?folder=%2Fsrv%2Fapp');
  });

  it('carries a file the climb could not read as its own list, never thrown — S-106', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      servers: [],
      errors: [{ folderPath: '/srv/app', reason: 'malformed' }],
    });

    const { result } = renderHook(() => useProjectMcpServers('claude', '/srv/app'), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.errors).toEqual([{ folderPath: '/srv/app', reason: 'malformed' }]);
    });
  });

  it('retry asks the folder again', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ servers: [], errors: [] });
    const { result } = renderHook(() => useProjectMcpServers('claude', '/srv/app'), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    result.current.retry();

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});
