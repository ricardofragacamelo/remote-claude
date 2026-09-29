/** How loud a notification is. The client picks the colour and the announcement from it. */
export const NOTIFICATION_SEVERITIES = ['info', 'warning', 'error'] as const;

export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];
