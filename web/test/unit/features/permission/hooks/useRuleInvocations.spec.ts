import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuleInvocations } from '@/features/permission/hooks/useRuleInvocations';
import * as service from '@/features/permission/services/rule.service';

afterEach(() => {
  vi.restoreAllMocks();
});

const page = (ids: readonly string[], nextCursor: string | null) =>
  ({
    invocations: ids.map((id) => ({ id, kind: 'shell', at: '2026-09-24T10:00:00.000Z' }) as never),
    nextCursor,
  }) as unknown as Awaited<ReturnType<typeof service.fetchRuleInvocations>>;

describe('the rule invocations hook', () => {
  it('reads the first page with no cursor', async () => {
    const fetch = vi
      .spyOn(service, 'fetchRuleInvocations')
      .mockResolvedValue(page(['inv-1'], null));

    const hook = renderHook((props: { ruleId: string }) => useRuleInvocations(props.ruleId), {
      initialProps: { ruleId: 'rule_1' },
    });
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });

    expect(fetch).toHaveBeenCalledWith('rule_1', null);
    expect(hook.result.current.invocations.map((item) => item.id)).toEqual(['inv-1']);
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('asks for the next page by the numeric cursor the wire sent as a string', async () => {
    const fetch = vi
      .spyOn(service, 'fetchRuleInvocations')
      .mockResolvedValueOnce(page(['inv-2', 'inv-1'], '7'))
      .mockResolvedValueOnce(page(['inv-0'], null));
    const hook = renderHook(() => useRuleInvocations('rule_1'));
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });

    act(() => {
      hook.result.current.loadMore();
    });
    await waitFor(() => {
      expect(hook.result.current.invocations.map((item) => item.id)).toEqual([
        'inv-2',
        'inv-1',
        'inv-0',
      ]);
    });

    expect(fetch).toHaveBeenLastCalledWith('rule_1', 7);
  });

  it('reads again from the top for a new rule id', async () => {
    const fetch = vi
      .spyOn(service, 'fetchRuleInvocations')
      .mockResolvedValueOnce(page(['inv-1'], null))
      .mockResolvedValueOnce(page(['inv-2'], null));
    const hook = renderHook((props: { ruleId: string }) => useRuleInvocations(props.ruleId), {
      initialProps: { ruleId: 'rule_1' },
    });
    await waitFor(() => {
      expect(hook.result.current.invocations.map((item) => item.id)).toEqual(['inv-1']);
    });

    hook.rerender({ ruleId: 'rule_2' });
    await waitFor(() => {
      expect(hook.result.current.invocations.map((item) => item.id)).toEqual(['inv-2']);
    });

    expect(fetch).toHaveBeenLastCalledWith('rule_2', null);
  });
});
