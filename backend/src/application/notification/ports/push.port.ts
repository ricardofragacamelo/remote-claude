import type { PushMessage } from '@domain/notification';

/**
 * How a message reaches a phone, and the three answers that matter.
 *
 * The three are not degrees of the same thing — they are different facts with different
 * consequences, and collapsing any two of them loses the one that matters:
 *
 * - `delivered` — the provider took it. It does **not** say anybody saw it;
 * - `tokenRejected` — the provider does not know this token any more. Permanent: the token is
 *   erased and the device stays approved (D-13);
 * - `failed` — the provider could not be reached, or refused for a reason of its own. A `warn`
 *   and nothing else: the request is still valid in the browser, and the deadline still decides
 *   in the silence (D-05).
 */
export type PushDelivery = 'delivered' | 'tokenRejected' | 'failed';

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
  send(message: PushMessage): Promise<PushDelivery>;
}

export const PUSH_SENDER = Symbol('PushSender');
