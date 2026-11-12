import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useRuleTemplates } from '@/features/permission/hooks/useRuleTemplates';
import { api } from '@/shared/api/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRuleTemplates — the catalog of pre-built rule bundles (plan 15, B-30, D-16)', () => {
  it('starts loading, then reads the catalog', async () => {
    const templates = { templates: [{ id: 'tpl-1', name: {}, description: {}, rules: [] }] };
    const get = vi.spyOn(api, 'get').mockResolvedValue(templates);
    const { result } = renderHook(() => useRuleTemplates());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.load).toEqual({ status: 'ready', value: templates });
    });
    expect(get).toHaveBeenCalledWith('/permission-rules/templates');
  });

  it('surfaces a failed read', async () => {
    const error = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} };
    vi.spyOn(api, 'get').mockRejectedValue(error);
    const { result } = renderHook(() => useRuleTemplates());

    await waitFor(() => {
      expect(result.current.load).toEqual({ status: 'failed', error });
    });
    expect(result.current.error).toEqual(error);
  });

  it('reloads on demand', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ templates: [] })
      .mockResolvedValueOnce({
        templates: [{ id: 'tpl-1', name: {}, description: {}, rules: [] }],
      });
    const { result } = renderHook(() => useRuleTemplates());

    await waitFor(() => {
      expect(result.current.load).toEqual({ status: 'ready', value: { templates: [] } });
    });

    result.current.reload();

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.load).toEqual({
        status: 'ready',
        value: { templates: [{ id: 'tpl-1', name: {}, description: {}, rules: [] }] },
      });
    });
  });
});
