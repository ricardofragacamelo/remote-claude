import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useRuleSimulation } from '@/features/permission/hooks/useRuleSimulation';
import type { SimulateRulesInput } from '@/features/permission/types/rule';
import { api } from '@/shared/api/api';

const input: SimulateRulesInput = {
  add: [{ pattern: 'shell(git status)', decision: 'allow' }],
  limit: 200,
};

describe('useRuleSimulation — "if this rule existed" against the trail (D-15, plan 15, B-27)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays idle, and never calls the server, while there is no draft worth simulating', () => {
    const post = vi.spyOn(api, 'post');
    const { result } = renderHook(() => useRuleSimulation(null));

    expect(result.current).toEqual({ status: 'idle' });
    expect(post).not.toHaveBeenCalled();
  });

  it('asks POST /permission-rules/simulate with the draft, and reads back the counts', async () => {
    const simulation = {
      counts: { unchanged: 0, wouldAutoAllow: 1, wouldAutoDeny: 0, wouldAsk: 0 },
      matches: [],
    };
    vi.spyOn(api, 'post').mockResolvedValue(simulation);
    const { result } = renderHook(() => useRuleSimulation(input));

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', value: simulation });
    });
    expect(api.post).toHaveBeenCalledWith('/permission-rules/simulate', input);
  });

  it('surfaces a server failure as a failed read', async () => {
    const error = { code: 'INTERNAL', messageKey: 'x', params: {} };
    vi.spyOn(api, 'post').mockRejectedValue(error);
    const { result } = renderHook(() => useRuleSimulation(input));

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'failed', error });
    });
  });
});
