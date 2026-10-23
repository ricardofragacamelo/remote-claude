import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useProjectMcpMutations } from '@/features/mcp/hooks/useProjectMcpMutations';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { providers } from '../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useProjectMcpMutations — plan 13, B-24, B-28', () => {
  it('approves with the folder, name and digest given', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ name: 'docs', state: 'approved' });
    const { result } = renderHook(() => useProjectMcpMutations('claude', '/srv/app'), {
      wrapper: providers(),
    });

    await act(() => result.current.approve('docs', 'd1'));

    expect(put).toHaveBeenCalledWith('/engines/claude/project-mcp-approvals', {
      folder: '/srv/app',
      name: 'docs',
      digest: 'd1',
    });
  });

  it('rejects by name, no digest asked', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    const { result } = renderHook(() => useProjectMcpMutations('claude', '/srv/app'), {
      wrapper: providers(),
    });

    await act(() => result.current.reject('docs'));

    expect(del).toHaveBeenCalledWith(
      '/engines/claude/project-mcp-approvals?folder=%2Fsrv%2Fapp&name=docs',
    );
  });

  it('carries a stale approval back as its error — S-102', async () => {
    const stale = new AppError('MCP_APPROVAL_STALE', 'mcp.error.approvalStale', 't1', {
      name: 'docs',
    });
    vi.spyOn(api, 'put').mockRejectedValue(stale);
    const { result } = renderHook(() => useProjectMcpMutations('claude', '/srv/app'), {
      wrapper: providers(),
    });

    await act(async () => {
      await expect(result.current.approve('docs', 'stale-digest')).rejects.toBe(stale);
    });
    await waitFor(() => {
      expect(result.current.saveError).toBe(stale);
    });
  });
});
