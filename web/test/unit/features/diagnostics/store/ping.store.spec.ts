import { beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { usePingStore } from '@/features/diagnostics/store/ping.store';

/** A pong event at a given sequence, answering the ping with `nonce`. */
function pong(seq: number, nonce = `n${String(seq)}`): Envelope {
  return {
    v: 1,
    id: `srv-${String(seq)}`,
    kind: 'event',
    type: 'diag.pong',
    ts: '2026-09-13T12:00:00.000Z',
    seq,
    sessionId: '01J0',
    payload: { sessionId: '01J0', pingedAt: '2026-09-13T12:00:00.000Z', pingCount: seq, nonce },
  };
}

describe('the round trips of Logs and diagnostics', () => {
  beforeEach(() => {
    usePingStore.getState().reset();
  });

  const apply = (frame: Envelope, at = 2_000): void => usePingStore.getState().apply(frame, at);
  const sent = (nonce: string, at = 1_000): void => usePingStore.getState().sent(nonce, at);
  const state = (): ReturnType<typeof usePingStore.getState> => usePingStore.getState();

  it('starts empty', () => {
    expect(state()).toMatchObject({ sessionId: null, lastSeq: 0, requests: [] });
  });

  it('keeps a ping that left, waiting for its answer', () => {
    sent('n1', 1_000);

    expect(state().requests).toEqual([
      { nonce: 'n1', sentAt: 1_000, pong: null, answeredAt: null },
    ]);
  });

  it('answers a ping with the pong that carries its nonce, and when it came', () => {
    sent('n1', 1_000);

    apply(pong(1, 'n1'), 1_042);

    expect(state().requests[0]).toMatchObject({ nonce: 'n1', answeredAt: 1_042 });
    expect(state().requests[0]?.pong?.seq).toBe(1);
    expect(state()).toMatchObject({ sessionId: '01J0', lastSeq: 1 });
  });

  it('matches each answer to its own ping, whatever the order they come in — S-141', () => {
    sent('first', 1_000);
    apply(pong(1, 'first'), 1_010);
    sent('second', 2_000);

    apply(pong(2, 'second'), 2_030);

    expect(state().requests.map((request) => [request.nonce, request.pong?.seq])).toEqual([
      ['first', 1],
      ['second', 2],
    ]);
  });

  it('lets a pong no ping of this screen sent answer nobody, and moves the sequence on — S-205', () => {
    sent('mine');

    apply(pong(1, 'another-window'));

    expect(state().requests[0]?.pong).toBeNull();
    expect(state().lastSeq).toBe(1);
  });

  it('never answers a ping twice, even with its own nonce again', () => {
    sent('n1');
    apply(pong(1, 'n1'), 1_500);

    apply(pong(2, 'n1'), 9_999);

    expect(state().requests[0]).toMatchObject({ answeredAt: 1_500 });
  });

  it('discards an event the replay delivered again, so nothing is answered twice', () => {
    sent('n1');
    apply(pong(1, 'n1'));
    sent('n2');

    apply(pong(1, 'n2'));

    expect(state().requests[1]?.pong).toBeNull();
    expect(state().lastSeq).toBe(1);
  });

  it('stamps an answer with the moment it arrived when nobody says', () => {
    sent('n1', 0);

    usePingStore.getState().apply(pong(1, 'n1'));

    expect(state().requests[0]?.answeredAt).toBeGreaterThan(0);
  });

  it('ignores a frame that is not one of ours', () => {
    sent('n1');

    apply({ ...pong(1, 'n1'), type: 'session.started' });

    expect(state().requests[0]?.pong).toBeNull();
    expect(state().lastSeq).toBe(0);
  });

  it('clears everything on a gap, instead of stitching a partial hole', () => {
    sent('n1');
    apply(pong(1, 'n1'));

    state().reset();

    expect(state()).toMatchObject({ sessionId: null, lastSeq: 0, requests: [] });
  });

  it('accepts the stream again from scratch after a reset', () => {
    apply(pong(9));
    state().reset();
    sent('n1');

    apply(pong(1, 'n1'));

    expect(state().requests[0]?.pong?.seq).toBe(1);
  });
});
