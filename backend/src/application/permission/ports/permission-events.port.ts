import type { PermissionRequest } from '@domain/permission';

/**
 * A permission request was settled, however it was settled.
 *
 * The whole request travels rather than a summary of it: the consumers need different parts —
 * `audit` wants the exact input and who decided, the session runtime wants only the verdict — and
 * an event shaped for one of them is an event the next consumer has to extend.
 */
export interface PermissionResolvedEvent {
  readonly request: PermissionRequest;
}

/**
 * The internal bus, for facts one module produces and others react to.
 *
 * `permission.resolved` has three consumers and none of them may be called directly: `audit`
 * writes the decision, the session runtime unblocks the agent loop, and — from the mobile plan on
 * — `notification` cancels the push that is no longer needed. Wiring those as method calls would
 * make `permission` depend on all three, and adding the fourth would mean editing it again
 * (docs/architecture/backend/03-modules.md#comunicação-assíncrona).
 *
 * Publication never throws: a consumer that fails must not be able to hold the agent loop open,
 * and the one thing this event does is let it go.
 */
export interface PermissionEvents {
  resolved(event: PermissionResolvedEvent): void;
}

export const PERMISSION_EVENTS = Symbol('PermissionEvents');
