import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearNotifications,
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  recordNotification,
} from '@/features/notifications/services/notification.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

afterEach(() => {
  vi.restoreAllMocks();
});

const dto = {
  id: 'n_1',
  severity: 'warning',
  messageKey: 'notification.connection.lost',
  params: {},
  count: 2,
  createdAt: '2026-09-30T12:00:00.000Z',
  readAt: null,
  extra: 'dropped',
} as const;

describe('the notification service', () => {
  it('reads the first page, and the next one by the cursor', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ items: [dto], unread: 1, nextCursor: '42' });

    await expect(fetchNotifications(null)).resolves.toEqual({
      items: [
        {
          id: 'n_1',
          severity: 'warning',
          messageKey: 'notification.connection.lost',
          params: {},
          count: 2,
          createdAt: '2026-09-30T12:00:00.000Z',
          readAt: null,
        },
      ],
      unread: 1,
      nextCursor: '42',
    });
    await fetchNotifications('42');

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      '/notifications',
      '/notifications?cursor=42',
    ]);
  });

  it('keeps one — only the severity, the key, the parameters, the count and the client id', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(dto);

    await recordNotification({
      clientId: 'c1',
      severity: 'warning',
      messageKey: 'notification.connection.lost',
      params: {},
      count: 2,
      ...({ actions: [{ labelKey: 'x' }], state: 'saving' } as object),
    });

    expect(post).toHaveBeenCalledWith('/notifications', {
      clientId: 'c1',
      severity: 'warning',
      messageKey: 'notification.connection.lost',
      params: {},
      count: 2,
    });
  });

  it('lets a refusal through, as the client made it', async () => {
    const offline = new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't');
    vi.spyOn(api, 'post').mockRejectedValue(offline);

    await expect(
      recordNotification({
        clientId: 'c1',
        severity: 'info',
        messageKey: 'notification.connection.restored',
        params: {},
        count: 1,
      }),
    ).rejects.toBe(offline);
  });

  it('marks some read, all read, clears one — the id in the path, escaped — and all', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue(undefined);
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await markNotificationsRead(['n_1', 'n_2']);
    await markAllNotificationsRead();
    await deleteNotification('n/1');
    await clearNotifications();

    expect(put.mock.calls).toEqual([
      ['/notifications/read', { ids: ['n_1', 'n_2'] }],
      ['/notifications/read-all', {}],
    ]);
    expect(remove.mock.calls.map(([path]) => path)).toEqual([
      '/notifications/n%2F1',
      '/notifications',
    ]);
  });
});
