import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

import { useRuleExpiryReminder } from '@/features/permission/hooks/useRuleExpiryReminder';
import * as service from '@/features/permission/services/rule.service';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { onNotify } from '@/shared/lib/notify';
import type { Notification } from '@/shared/lib/notify';
import { renderRouted } from '../../../../support/render';

const LAST_SHOWN_STORAGE_KEY = `${VISITOR_PREFIX}rules.expiryReminder.lastShownOn`;

const SUMMARY = {
  byStatus: { active: 10, expired: 0, revoked: 0, disabled: 0 },
  byDecision: { allow: 10, deny: 0 },
  byScope: { project: 0, always: 10 },
};

function Harness(): null {
  useRuleExpiryReminder();
  return null;
}

function listened(): { told: Notification[]; stop(): void } {
  const told: Notification[] = [];
  const stop = onNotify((notification) => told.push(notification));
  return { told, stop };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the once-a-day rule-expiry reminder — plan 15, B-25, S-179, D-18', () => {
  it('tells how many expire, with an action that opens the filtered tab', async () => {
    vi.spyOn(service, 'fetchRuleSummary').mockResolvedValue({ ...SUMMARY, expiringBefore: 3 });
    const { told, stop } = listened();

    const routed = renderRouted(<Harness />);

    await waitFor(() => {
      expect(told).toHaveLength(1);
    });
    expect(told[0]).toMatchObject({
      severity: 'info',
      messageKey: 'notification.rules.expiringSoon',
      params: { count: 3 },
    });

    told[0]!.actions?.[0]?.run();

    await waitFor(() => {
      expect(routed.path()).toBe('/rules');
    });
    expect(routed.search()).toMatchObject({ tab: 'expiringSoon' });
    stop();
  });

  it('says nothing when none expire soon, and does not mark the day as shown', async () => {
    vi.spyOn(service, 'fetchRuleSummary').mockResolvedValue({ ...SUMMARY, expiringBefore: 0 });
    const { told, stop } = listened();

    renderRouted(<Harness />);

    await waitFor(() => {
      expect(service.fetchRuleSummary).toHaveBeenCalled();
    });
    expect(told).toEqual([]);
    expect(localStorage.getItem(LAST_SHOWN_STORAGE_KEY)).toBeNull();
    stop();
  });

  it('says nothing twice the same day — the second mount finds today already shown', async () => {
    const fetch = vi
      .spyOn(service, 'fetchRuleSummary')
      .mockResolvedValue({ ...SUMMARY, expiringBefore: 2 });
    const { told, stop } = listened();

    const first = renderRouted(<Harness />);
    await waitFor(() => {
      expect(told).toHaveLength(1);
    });

    first.unmount();
    renderRouted(<Harness />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(told).toHaveLength(1);
    stop();
  });

  it('a failed read says nothing, and does not mark the day as shown — tried again next mount', async () => {
    vi.spyOn(service, 'fetchRuleSummary').mockRejectedValue({
      code: 'INTERNAL',
      messageKey: 'error.internal',
      params: {},
    });
    const { told, stop } = listened();

    renderRouted(<Harness />);

    await waitFor(() => {
      expect(service.fetchRuleSummary).toHaveBeenCalled();
    });
    expect(told).toEqual([]);
    expect(localStorage.getItem(LAST_SHOWN_STORAGE_KEY)).toBeNull();
    stop();
  });

  it('ignores a stored value that is not a day — written by hand, or by an older version', async () => {
    localStorage.setItem(LAST_SHOWN_STORAGE_KEY, JSON.stringify('not-a-day'));
    vi.spyOn(service, 'fetchRuleSummary').mockResolvedValue({ ...SUMMARY, expiringBefore: 1 });
    const { told, stop } = listened();

    renderRouted(<Harness />);

    await waitFor(() => {
      expect(told).toHaveLength(1);
    });
    stop();
  });

  it("shows again on a new day — yesterday's mark does not suppress today", async () => {
    localStorage.setItem(LAST_SHOWN_STORAGE_KEY, JSON.stringify('2000-01-01'));
    vi.spyOn(service, 'fetchRuleSummary').mockResolvedValue({ ...SUMMARY, expiringBefore: 1 });
    const { told, stop } = listened();

    renderRouted(<Harness />);

    await waitFor(() => {
      expect(told).toHaveLength(1);
    });
    stop();
  });
});
