import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useDevices } from '@/features/devices/hooks/useDevices';
import { api } from '@/shared/api/api';

const device = {
  id: 'dev_1',
  name: 'Pixel 8',
  platform: 'android',
  appVersion: '1.0.0',
  locale: 'pt-BR',
  status: 'pending',
  pushEnabled: true,
  registeredAt: '2026-09-18T10:00:00.000Z',
  lastSeenAt: '2026-09-18T10:00:00.000Z',
  approvedAt: null,
  revokedAt: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The races the screen cannot show, and the hook therefore has to answer.
 *
 * `DeviceList.spec.tsx` covers what a person sees. What is left here is the ordering a rendered
 * screen cannot be made to hold still for: an answer that arrives after the list it belonged to
 * has been thrown away.
 */
describe('the devices hook', () => {
  it('drops the row an action changed when the list has been reloaded under it', async () => {
    // The first load answers; the reload is still in flight when the approval comes back, which
    // is the ordering this test exists for.
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ devices: [device] })
      .mockReturnValue(new Promise(() => undefined));

    // Never settles, so the test decides when the approval comes back.
    let approve: (changed: unknown) => void = () => undefined;
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        approve = resolve;
      }),
    );

    const { result } = renderHook(() => useDevices());
    await waitFor(() => {
      expect(result.current.devices).toHaveLength(1);
    });

    act(() => {
      result.current.approve('dev_1');
    });

    // The reload throws the list away: what the approval is about to answer is a row of a list
    // that no longer exists, and writing it back would put a stale device on screen.
    act(() => {
      result.current.reload();
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      approve({ ...device, status: 'approved' });
      await Promise.resolve();
    });

    expect(result.current.devices).toEqual([]);
  });

  it('stops saying an action is in flight once it has answered', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ devices: [device] });
    vi.spyOn(api, 'post').mockResolvedValue({ ...device, status: 'approved' });

    const { result } = renderHook(() => useDevices());
    await waitFor(() => {
      expect(result.current.devices).toHaveLength(1);
    });

    act(() => {
      result.current.approve('dev_1');
    });
    expect(result.current.pendingId).toBe('dev_1');

    await waitFor(() => {
      expect(result.current.pendingId).toBeNull();
    });
    expect(result.current.devices[0]?.status).toBe('approved');
  });
});
