import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useRule } from '@/features/permission/hooks/useRule';
import * as service from '@/features/permission/services/rule.service';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the one-rule hook', () => {
  it('opens the rule by id', async () => {
    const fetch = vi.spyOn(service, 'fetchRule').mockResolvedValue({ id: 'rule_1' } as never);

    const hook = renderHook((props: { ruleId: string }) => useRule(props.ruleId), {
      initialProps: { ruleId: 'rule_1' },
    });

    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });

    expect(fetch).toHaveBeenCalledWith('rule_1');
    expect(hook.result.current.load).toEqual({ status: 'ready', value: { id: 'rule_1' } });
  });

  it('opens the new rule when the id changes', async () => {
    const fetch = vi
      .spyOn(service, 'fetchRule')
      .mockResolvedValueOnce({ id: 'rule_1' } as never)
      .mockResolvedValueOnce({ id: 'rule_2' } as never);
    const hook = renderHook((props: { ruleId: string }) => useRule(props.ruleId), {
      initialProps: { ruleId: 'rule_1' },
    });
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });

    hook.rerender({ ruleId: 'rule_2' });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    expect(fetch).toHaveBeenLastCalledWith('rule_2');
  });
});
