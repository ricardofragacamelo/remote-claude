/** One round trip, as this feature models it — not as the wire sends it. */
export interface Pong {
  readonly seq: number;
  readonly sessionId: string;
  readonly pingedAt: string;
  readonly pingCount: number;
  readonly nonce: string;
}
