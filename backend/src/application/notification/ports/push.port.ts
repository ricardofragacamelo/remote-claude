import type { PushMessage } from '@domain/notification';

/**
 * How a message reaches a phone, and the four answers that matter.
 *
 * They are not degrees of the same thing — they are different facts with different consequences,
 * and collapsing any two of them loses the one that matters:
 *
 * - `delivered` — the provider took it. It does **not** say anybody saw it;
 * - `tokenRejected` — the provider does not know this token any more. Permanent: the token is
 *   erased and the device stays approved (D-13 of plan 02);
 * - `rejected` — the provider refused the message for a reason of its own that asking again will
 *   not change (a `4xx` other than the ones below). Not tried again;
 * - `failed` — the provider could not be reached, or answered in a way that may pass: the network,
 *   `408`, `429`, `5xx`, or a `401` on an access token that is minted afresh next time. Tried again,
 *   a bounded number of times ([D-09 of plan 05](../../../../../docs/plans/05-hardening-operations/decisions.md)).
 */
export type PushDelivery = 'delivered' | 'tokenRejected' | 'rejected' | 'failed';

/** One attempt: what happened, and how long the provider asked us to wait, when it said. */
export interface PushOutcome {
  readonly delivery: PushDelivery;

  /** The provider's `Retry-After`, in milliseconds — it rules the backoff when it comes. */
  readonly retryAfterMs: number | null;
}

/**
 * The provider, behind a port.
 *
 * It is the **only** thing in the backend that knows who the provider is, and even it does not
 * know the name: what it holds is an endpoint and a credential, both from configuration
 * ([AGENTS.md](../../../../../AGENTS.md)).
 *
 * It never throws. A provider that could throw would be a provider that can hold a permission
 * open, and this whole module is a best effort beside a deadline that is not.
 */
export interface PushSender {
  send(message: PushMessage): Promise<PushOutcome>;
}

export const PUSH_SENDER = Symbol('PushSender');
