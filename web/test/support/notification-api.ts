import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

/** One entry, as `GET /notifications` answers it. */
export interface NotificationDto {
  readonly id: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly count: number;
  readonly createdAt: string;
  readonly readAt: string | null;
}

/** What `POST /notifications` is sent. */
export interface RecordBody {
  readonly clientId: string;
  readonly severity: NotificationDto['severity'];
  readonly messageKey: string;
  readonly params: NotificationDto['params'];
  readonly count: number;
}

export function aNotification(id: string, extra: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id,
    severity: 'warning',
    messageKey: 'notification.connection.lost',
    params: {},
    count: 1,
    createdAt: '2026-09-30T12:00:00.000Z',
    readAt: null,
    ...extra,
  };
}

/**
 * The backend's notification centre, in memory, as B-40 behaves: newest first, the same client id
 * kept once, "read" and "cleared" answered also for what is not there. A page holds `pageSize`.
 *
 * Every other request never answers.
 */
export function aNotificationServer(initial: readonly NotificationDto[] = [], pageSize = 50) {
  let items = [...initial];
  const kept = new Map<string, NotificationDto>();
  let created = 0;
  const failing = { posts: 0, gets: 0, deletes: 0 };
  const offline = (): AppError =>
    new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 'trace-n');

  const page = (cursor: string | null) => {
    const start = cursor === null ? 0 : Number(cursor);
    const next = start + pageSize < items.length ? String(start + pageSize) : null;
    return {
      items: items.slice(start, start + pageSize),
      unread: items.filter((item) => item.readAt === null).length,
      nextCursor: next,
    };
  };

  const never = <T>(): Promise<T> => new Promise(() => undefined);

  const get = vi.spyOn(api, 'get').mockImplementation((path: string) => {
    if (!path.startsWith('/notifications')) return never();
    if (failing.gets > 0) {
      failing.gets -= 1;
      return Promise.reject(offline());
    }
    const cursor = new URLSearchParams(path.split('?')[1] ?? '').get('cursor');
    return Promise.resolve(page(cursor));
  });

  const post = vi.spyOn(api, 'post').mockImplementation((path: string, body: unknown) => {
    if (path !== '/notifications') return never();
    if (failing.posts > 0) {
      failing.posts -= 1;
      return Promise.reject(offline());
    }
    const sent = body as RecordBody;
    const existing = kept.get(sent.clientId);
    if (existing !== undefined) return Promise.resolve(existing);
    created += 1;
    const entry = aNotification(`n_new_${String(created)}`, {
      severity: sent.severity,
      messageKey: sent.messageKey,
      params: sent.params,
      count: sent.count,
    });
    kept.set(sent.clientId, entry);
    items = [entry, ...items];
    return Promise.resolve(entry);
  });

  const put = vi.spyOn(api, 'put').mockImplementation((path: string, body: unknown) => {
    const now = '2026-09-30T13:00:00.000Z';
    if (path === '/notifications/read') {
      const { ids } = body as { ids: readonly string[] };
      items = items.map((item) => (ids.includes(item.id) ? { ...item, readAt: now } : item));
    } else if (path === '/notifications/read-all') {
      items = items.map((item) => ({ ...item, readAt: item.readAt ?? now }));
    } else {
      return never();
    }
    return Promise.resolve(undefined);
  });

  const remove = vi.spyOn(api, 'delete').mockImplementation((path: string) => {
    if (!path.startsWith('/notifications')) return never();
    if (failing.deletes > 0) {
      failing.deletes -= 1;
      return Promise.reject(offline());
    }
    const id = path.split('/')[2];
    items = id === undefined ? [] : items.filter((item) => item.id !== decodeURIComponent(id));
    return Promise.resolve(undefined);
  });

  return {
    get,
    post,
    put,
    remove,
    failing,
    items: () => items,
    /** The client ids of every `POST`, in order. */
    sentClientIds: () => post.mock.calls.map(([, body]) => (body as RecordBody).clientId),
  };
}
