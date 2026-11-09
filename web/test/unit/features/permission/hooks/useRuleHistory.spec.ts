import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useRuleHistory } from '@/features/permission/hooks/useRuleHistory';
import * as service from '@/features/permission/services/rule.service';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the rule history hook', () => {
  it('reads the events of the rule it was given', async () => {
    const fetch = vi.spyOn(service, 'fetchRuleHistory').mockResolvedValue({ events: [] });

    const hook = renderHook((props: { ruleId: string }) => useRuleHistory(props.ruleId), {
      initialProps: { ruleId: 'rule_1' },
    });

    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });

    expect(fetch).toHaveBeenCalledWith('rule_1');
    expect(hook.result.current.load).toEqual({ status: 'ready', value: { events: [] } });
  });

  it('reads again for a new rule id', async () => {
    const fetch = vi
      .spyOn(service, 'fetchRuleHistory')
      .mockResolvedValueOnce({ events: [] })
      .mockResolvedValueOnce({ events: [] });
    const hook = renderHook((props: { ruleId: string }) => useRuleHistory(props.ruleId), {
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
