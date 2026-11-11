import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useRuleEvaluation } from '@/features/permission/hooks/useRuleEvaluation';
import type { EvaluateRuleInput } from '@/features/permission/types/rule';
import { api } from '@/shared/api/api';

const input: EvaluateRuleInput = {
  kind: 'shell',
  subject: { command: 'git status' },
};

describe('useRuleEvaluation — what testing a command against the rules in force decides (plan 15, B-28, S-196)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays idle, and never calls the server, while there is nothing worth testing yet', () => {
    const post = vi.spyOn(api, 'post');
    const { result } = renderHook(() => useRuleEvaluation(null));

    expect(result.current).toEqual({ status: 'idle' });
    expect(post).not.toHaveBeenCalled();
  });

  it('asks POST /permission-rules/evaluate with the input, and reads back the verdict', async () => {
    const evaluation = {
      outcome: 'allow',
      answeringRule: null,
      matching: [],
      reasons: ['noRule'],
      caveats: [],
    };
    vi.spyOn(api, 'post').mockResolvedValue(evaluation);
    const { result } = renderHook(() => useRuleEvaluation(input));

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', value: evaluation });
    });
    expect(api.post).toHaveBeenCalledWith('/permission-rules/evaluate', input);
  });

  it('surfaces a refused folder as a failed read (S-199)', async () => {
    const error = { code: 'WORKSPACE_NOT_ALLOWED', messageKey: 'x', params: {} };
    vi.spyOn(api, 'post').mockRejectedValue(error);
    const { result } = renderHook(() => useRuleEvaluation({ ...input, folder: '/not/allowed' }));

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'failed', error });
    });
  });
});
