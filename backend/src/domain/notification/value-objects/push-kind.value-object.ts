/**
 * What a push is for.
 *
 * Two, and the second is the reason there is an enumeration at all: a provider has no way to take
 * a notification back, so **cancelling is itself a message** — a silent one the app acts on by
 * dismissing what it already showed. A notification for an action that no longer exists is the
 * fastest way to teach somebody to ignore this app's notifications.
 */
export const PUSH_KINDS = ['permissionRequested', 'permissionResolved'] as const;

export type PushKind = (typeof PUSH_KINDS)[number];
