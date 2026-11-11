import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useRulePreview } from '@/features/permission/hooks/useRulePreview';
import type { PreviewRuleInput } from '@/features/permission/types/rule';
import { api } from '@/shared/api/api';

const input: PreviewRuleInput = {
  pattern: 'shell(git status)',
  decision: 'allow',
  scope: 'always',
};

describe('useRulePreview — the grammar’s own read of a draft pattern (plan 15, B-27, S-185)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays idle, and never calls the server, while there is no draft worth asking about', () => {
    const post = vi.spyOn(api, 'post');
    const { result } = renderHook(() => useRulePreview(null));

    expect(result.current).toEqual({ status: 'idle' });
    expect(post).not.toHaveBeenCalled();
  });

  it('asks POST /permission-rules/preview with the draft, and reads back the preview', async () => {
    const preview = {
      pattern: 'shell(git status)',
      reach: { decision: 'allow', scope: 'always' },
      breadth: 'narrow',
      findings: [],
    };
    vi.spyOn(api, 'post').mockResolvedValue(preview);
    const { result } = renderHook(() => useRulePreview(input));

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', value: preview });
    });
    expect(api.post).toHaveBeenCalledWith('/permission-rules/preview', input);
  });

  it('surfaces the server’s own grammar error as a failed read', async () => {
    const error = { code: 'PERMISSION_RULE_PATTERN_INVALID', messageKey: 'x', params: {} };
    vi.spyOn(api, 'post').mockRejectedValue(error);
    const { result } = renderHook(() => useRulePreview(input));

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'failed', error });
    });
  });
});
