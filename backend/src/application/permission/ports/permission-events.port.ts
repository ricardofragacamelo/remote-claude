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
 * A question has been put to a human, and nothing has answered it yet.
 *
 * It is published **after** the card is on the wire, because that ordering is the difference
 * between the two channels: whoever has the screen open has already been asked, and the push
 * exists for whoever has not. `notification` is its only consumer.
 */
export interface PermissionRequestedEvent {
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
  /**
   * Somebody has to decide something.
   *
   * Not published for a request a rule settled on its own: nothing was ever asked, so there is
   * nothing to notify anybody about.
   */
  requested(event: PermissionRequestedEvent): void;

  resolved(event: PermissionResolvedEvent): void;
}

export const PERMISSION_EVENTS = Symbol('PermissionEvents');
