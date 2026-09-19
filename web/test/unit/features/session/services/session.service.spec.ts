import { describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { PING, sendPing, toPong } from '@/features/session/services/session.service';
import type { WsClient } from '@/shared/api/ws-client';

/** A client that records the commands it was asked to send. */
function recordingClient(accepted = true): WsClient & { command: ReturnType<typeof vi.fn> } {
  return { command: vi.fn().mockReturnValue(accepted) } as unknown as WsClient & {
    command: ReturnType<typeof vi.fn>;
  };
}

/**
 * An event frame as the gateway sends it.
 *
 * The overrides are a loose record on purpose: several of these cases are about a field being
 * **absent**, which `exactOptionalPropertyTypes` will not let a `Partial<Envelope>` express.
 */
function pongFrame(overrides: Record<string, unknown> = {}): Envelope {
  return {
    v: 1,
    id: 'srv-1',
    kind: 'event',
    type: 'diag.pong',
    ts: '2026-09-13T12:00:00.000Z',
    seq: 3,
    sessionId: '01J0',
    payload: { sessionId: '01J0', pingedAt: '2026-09-13T12:00:00.000Z', pingCount: 2, nonce: 'n' },
    ...overrides,
  } as Envelope;
}

describe('sendPing', () => {
  it('opens a session when it is given none', () => {
    const client = recordingClient();

    sendPing(client, { sessionId: null, nonce: 'n' });

    expect(client.command).toHaveBeenCalledWith(PING, { nonce: 'n' });
  });

  it('pings the session it is given', () => {
    const client = recordingClient();

    sendPing(client, { sessionId: '01J0', nonce: 'n' });

    expect(client.command).toHaveBeenCalledWith(PING, { sessionId: '01J0', nonce: 'n' });
  });

  it('reports that a command the socket refused did not leave', () => {
    expect(sendPing(recordingClient(false), { sessionId: null, nonce: 'n' })).toBe(false);
  });
});

describe('toPong', () => {
  it('turns the frame into the feature’s own model', () => {
    expect(toPong(pongFrame())).toEqual({
      seq: 3,
      sessionId: '01J0',
      pingedAt: '2026-09-13T12:00:00.000Z',
      pingCount: 2,
      nonce: 'n',
    });
  });

  it.each([
    ['another event type', pongFrame({ type: 'session.started' })],
    ['no sequence', pongFrame({ seq: undefined })],
    ['no payload', pongFrame({ payload: undefined })],
    [
      'a payload missing the session',
      pongFrame({ payload: { pingedAt: 'x', pingCount: 1, nonce: 'n' } }),
    ],
    [
      'a payload missing the instant',
      pongFrame({ payload: { sessionId: '01J0', pingCount: 1, nonce: 'n' } }),
    ],
    [
      'a count that is not a number',
      pongFrame({ payload: { sessionId: '01J0', pingedAt: 'x', pingCount: '1', nonce: 'n' } }),
    ],
    ['no nonce', pongFrame({ payload: { sessionId: '01J0', pingedAt: 'x', pingCount: 1 } })],
  ])('answers null for %s', (_case, frame) => {
    expect(toPong(frame)).toBeNull();
  });
});
