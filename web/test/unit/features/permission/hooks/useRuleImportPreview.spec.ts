import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useRuleImportPreview } from '@/features/permission/hooks/useRuleImportPreview';
import { api } from '@/shared/api/api';

const file = JSON.stringify({ format: 'remote-claude.permission-rules', version: 1, rules: [] });

describe('useRuleImportPreview — one verdict per item of an import file (plan 15, B-30)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays idle, and never calls the server, while there is no file to preview yet', () => {
    const post = vi.spyOn(api, 'post');
    const { result } = renderHook(() => useRuleImportPreview(null));

    expect(result.current).toEqual({ status: 'idle' });
    expect(post).not.toHaveBeenCalled();
  });

  it('asks POST /permission-rules/import/preview with the file, and reads back the verdicts', async () => {
    const preview = {
      digest: 'sha-1',
      items: [
        {
          index: 0,
          pattern: 'shell(a)',
          decision: 'allow',
          scope: 'always',
          verdict: 'new',
          breadth: 'narrow',
        },
      ],
    };
    vi.spyOn(api, 'post').mockResolvedValue(preview);
    const { result } = renderHook(() => useRuleImportPreview(file));

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', value: preview });
    });
    expect(api.post).toHaveBeenCalledWith('/permission-rules/import/preview', { file });
  });

  it('surfaces a rejected preview as a failed read', async () => {
    const error = { code: 'PERMISSION_RULE_IMPORT_TOO_LARGE', messageKey: 'x', params: {} };
    vi.spyOn(api, 'post').mockRejectedValue(error);
    const { result } = renderHook(() => useRuleImportPreview(file));

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'failed', error });
    });
  });
});
