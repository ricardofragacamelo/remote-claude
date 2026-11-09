import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useRuleSummary } from '@/features/permission/hooks/useRuleSummary';
import type { RuleFilters } from '@/features/permission';
import * as service from '@/features/permission/services/rule.service';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the rule summary hook', () => {
  it('reads the summary for the filters it was given', async () => {
    const fetch = vi
      .spyOn(service, 'fetchRuleSummary')
      .mockResolvedValue({ byStatus: { active: 3 } } as never);

    const hook = renderHook((props: { filters: RuleFilters }) => useRuleSummary(props.filters), {
      initialProps: { filters: { decision: 'deny' } },
    });

    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });

    expect(fetch).toHaveBeenCalledWith({ decision: 'deny' });
    expect(hook.result.current.load).toEqual({
      status: 'ready',
      value: { byStatus: { active: 3 } },
    });
  });

  it('does not reload for a new object holding the same filters', async () => {
    const fetch = vi.spyOn(service, 'fetchRuleSummary').mockResolvedValue({} as never);
    const hook = renderHook((props: { filters: RuleFilters }) => useRuleSummary(props.filters), {
      initialProps: { filters: { scope: 'always' } },
    });
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });

    hook.rerender({ filters: { scope: 'always' } });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reloads for a new filter', async () => {
    const fetch = vi.spyOn(service, 'fetchRuleSummary').mockResolvedValue({} as never);
    const hook = renderHook((props: { filters: RuleFilters }) => useRuleSummary(props.filters), {
      initialProps: { filters: { scope: 'always' } },
    });
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });

    hook.rerender({ filters: { scope: 'project' } });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    expect(fetch).toHaveBeenLastCalledWith({ scope: 'project' });
  });
});
