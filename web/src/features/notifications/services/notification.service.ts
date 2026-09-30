import { api } from '@/shared/api/api';
import type {
  NotificationEntry,
  NotificationPage,
  PendingNotification,
} from '../types/notification';

/** The shape the backend answers with. It stops existing at the end of this file. */
interface NotificationDto {
  readonly id: string;
  readonly severity: NotificationEntry['severity'];
  readonly messageKey: string;
  readonly params: NotificationEntry['params'];
  readonly count: number;
  readonly createdAt: string;
  readonly readAt: string | null;
}

interface NotificationPageDto {
  readonly items: readonly NotificationDto[];
  readonly unread: number;
  readonly nextCursor: string | null;
}

function toEntry(dto: NotificationDto): NotificationEntry {
  return {
    id: dto.id,
    severity: dto.severity,
    messageKey: dto.messageKey,
    params: dto.params,
    count: dto.count,
    createdAt: dto.createdAt,
    readAt: dto.readAt,
  };
}

/**
 * A page of this user's notification centre, newest first, and how many are unread — on the
 * server, so it follows the user to another device and survives a reload
 * ([06 · D-17](../../../../../docs/plans/06-workbench/decisions.md#d-17--o-que-vira-notificação-e-onde-vive-o-histórico)).
 *
 * @param cursor where the previous page said the next one starts; `null` for the first
 */
export async function fetchNotifications(cursor: string | null): Promise<NotificationPage> {
  const search = cursor === null ? '' : `?${new URLSearchParams({ cursor }).toString()}`;
  const page = await api.get<NotificationPageDto>(`/notifications${search}`);

  return { items: page.items.map(toEntry), unread: page.unread, nextCursor: page.nextCursor };
}

/**
 * Keeps a notification on the server.
 *
 * Idempotent by the client id: a second send of the same one — the answer to the first never
 * arrived — is answered with the entry already kept, never a second one (plan 06, S-182). Only
 * `severity`, `messageKey`, `params` and the count travel: never a piece of a conversation.
 *
 * @throws {import('@/shared/api/errors').AppError} `INVALID_INPUT` for a key or parameters outside
 *   the server's catalogue; `NETWORK_UNREACHABLE` when it could not be asked
 */
export async function recordNotification(
  pending: Pick<PendingNotification, 'clientId' | 'severity' | 'messageKey' | 'params' | 'count'>,
): Promise<NotificationEntry> {
  return toEntry(
    await api.post<NotificationDto>('/notifications', {
      clientId: pending.clientId,
      severity: pending.severity,
      messageKey: pending.messageKey,
      params: pending.params,
      count: pending.count,
    }),
  );
}

/** Marks entries read — on every device of this user. Answered also for one already read. */
export async function markNotificationsRead(ids: readonly string[]): Promise<void> {
  await api.put<undefined>('/notifications/read', { ids });
}

/** Marks every entry read. */
export async function markAllNotificationsRead(): Promise<void> {
  await api.put<undefined>('/notifications/read-all', {});
}

/** Deletes one entry. Answered also when it is not there. */
export async function deleteNotification(id: string): Promise<void> {
  await api.delete<undefined>(`/notifications/${encodeURIComponent(id)}`);
}

/** Deletes every entry of this user. */
export async function clearNotifications(): Promise<void> {
  await api.delete<undefined>('/notifications');
}
