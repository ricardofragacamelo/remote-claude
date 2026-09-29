import { z } from 'zod';

import {
  NOTIFICATION_HISTORY_LIMIT,
  NOTIFICATION_PARAM_MAX_LENGTH,
  NOTIFICATION_SEVERITIES,
} from '@domain/notification';
import type {
  NotificationEntry,
  NotificationParams,
  NotificationSeverity,
} from '@domain/notification';

/** How many notifications a client may group into one entry — a burst, not a counter of the day. */
export const NOTIFICATION_COUNT_MAX = 10_000;

/**
 * What `POST /notifications` is sent.
 *
 * Format only, as everywhere at this edge: whether the key is one the centre keeps, and whether the
 * parameters are the ones it takes, is the domain's catalogue. `strict`: a field this contract does
 * not name is refused rather than ignored — an ignored field is a place for content to travel.
 */
export const recordNotificationSchema = z
  .object({
    /** The client's own id for the entry: what makes sending it twice keep one. */
    clientId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    severity: z.enum(NOTIFICATION_SEVERITIES),
    messageKey: z
      .string()
      .max(128)
      .regex(/^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/),
    params: z.record(
      z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/),
      z.union([z.string().max(NOTIFICATION_PARAM_MAX_LENGTH), z.number().finite(), z.boolean()]),
    ),
    count: z.number().int().min(1).max(NOTIFICATION_COUNT_MAX),
  })
  .strict();

export type RecordNotificationDto = z.infer<typeof recordNotificationSchema>;

/** What `GET /notifications` is asked: where the page starts, as the previous page said. */
export const listNotificationsSchema = z.object({
  cursor: z
    .string()
    .regex(/^\d{1,18}$/)
    .optional(),
});

export type ListNotificationsDto = z.infer<typeof listNotificationsSchema>;

/** What `PUT /notifications/read` is sent. */
export const markNotificationsReadSchema = z
  .object({
    ids: z.array(z.string().min(1).max(64)).min(1).max(NOTIFICATION_HISTORY_LIMIT),
  })
  .strict();

export type MarkNotificationsReadDto = z.infer<typeof markNotificationsReadSchema>;

/** One entry of the centre, as the client reads it. */
export interface NotificationDto {
  readonly id: string;
  readonly severity: NotificationSeverity;
  readonly messageKey: string;
  readonly params: NotificationParams;
  readonly count: number;
  /** ISO-8601. */
  readonly createdAt: string;
  /** ISO-8601, or `null` while unread. */
  readonly readAt: string | null;
}

/** A page of the centre, newest first. */
export interface NotificationPageDto {
  readonly items: readonly NotificationDto[];
  readonly unread: number;
  readonly nextCursor: string | null;
}

export function toNotificationDto(entry: NotificationEntry): NotificationDto {
  return {
    id: entry.id,
    severity: entry.severity,
    messageKey: entry.messageKey,
    params: entry.params,
    count: entry.count,
    createdAt: entry.createdAt.toISOString(),
    readAt: entry.readAt?.toISOString() ?? null,
  };
}
