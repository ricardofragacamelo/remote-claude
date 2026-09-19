import type { UserId } from '@domain/auth';

/**
 * Input of `PingDiagUseCase`.
 *
 * `sessionId` is `null`, never absent: with `exactOptionalPropertyTypes` an optional property and
 * an explicit `undefined` are different types, and "open a new session" deserves to be a value
 * the caller states rather than a field they forgot.
 */
export interface PingDiagCommand {
  /** Session to ping, or `null` to open one. */
  readonly sessionId: string | null;

  /** Echoed back in the pong. */
  readonly nonce: string;

  /** Who is asking, from the validated token. */
  readonly userId: UserId;
}
