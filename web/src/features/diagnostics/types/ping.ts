/** One round trip, as this feature models it — not as the wire sends it. */
export interface Pong {
  readonly seq: number;
  readonly sessionId: string;
  readonly pingedAt: string;
  readonly pingCount: number;
  readonly nonce: string;
}

/**
 * One ping this screen sent, and what came back for it — matched by its `nonce`, never by order: an
 * answer that is not for this request is not its answer (plan 06, S-141, S-205).
 */
export interface PingRequest {
  readonly nonce: string;

  /** When it left, by this browser's clock. */
  readonly sentAt: number;

  /** Its answer, once it arrived. */
  readonly pong: Pong | null;

  /** When the answer arrived, by the same clock — so the round trip never mixes two clocks. */
  readonly answeredAt: number | null;
}
