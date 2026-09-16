import type { Envelope } from '@remote-claude/contracts';

import type { WsClient } from '@/shared/api/ws-client';
import type { Pong } from '../types/pong';

/** The command of the walking skeleton. */
export const PING = 'session.ping';

/** The event it produces. */
export const PONG = 'session.pong';

/**
 * Sends a ping.
 *
 * A service knows the command, its payload and how to read the answer — and nothing about React or
 * about when it should be called. That is the hook's decision.
 *
 * @returns whether the command left; a socket that is not ready silently sends nothing
 */
export function sendPing(
  client: WsClient,
  input: { readonly sessionId: string | null; readonly nonce: string },
): boolean {
  return client.command(PING, {
    ...(input.sessionId === null ? {} : { sessionId: input.sessionId }),
    nonce: input.nonce,
  });
}

/**
 * The feature's model of a frame, or `null` when the frame is not one of ours.
 *
 * This is where the shape of the backend stops existing. Everything above works with `Pong`.
 */
export function toPong(frame: Envelope): Pong | null {
  const payload = frame.payload as Partial<Pong> | undefined;

  if (frame.type !== PONG || frame.seq === undefined || payload === undefined) {
    return null;
  }

  const { sessionId, pingedAt, pingCount, nonce } = payload;

  if (
    typeof sessionId !== 'string' ||
    typeof pingedAt !== 'string' ||
    typeof pingCount !== 'number' ||
    typeof nonce !== 'string'
  ) {
    return null;
  }

  return { seq: frame.seq, sessionId, pingedAt, pingCount, nonce };
}
