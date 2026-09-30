import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useNotificationCenter } from '@/features/notifications/hooks/useNotificationCenter';
import { aNotification, aNotificationServer } from '../../../../support/notification-api';
import { providers } from '../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a change to the centre while another is on its way', () => {
  it('is not sent: two clicks on "clear" delete once', async () => {
    const server = aNotificationServer([aNotification('n_1'), aNotification('n_2')]);
    const { result } = renderHook(() => useNotificationCenter(), { wrapper: providers() });
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(2);
    });

    act(() => {
      result.current.remove('n_1');
      result.current.remove('n_2');
    });

    await waitFor(() => {
      expect(result.current.isBusy).toBe(false);
    });
    expect(server.remove).toHaveBeenCalledTimes(1);
    expect(server.items().map((item) => item.id)).toEqual(['n_2']);
  });
});
