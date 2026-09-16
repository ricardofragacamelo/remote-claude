import { beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { useSessionStreamStore } from '@/features/session/store/session-stream.store';

/** A pong event at a given sequence. */
function pong(seq: number, nonce = `n${String(seq)}`): Envelope {
  return {
    v: 1,
    id: `srv-${String(seq)}`,
    kind: 'event',
    type: 'session.pong',
    ts: '2026-09-13T12:00:00.000Z',
    seq,
    sessionId: '01J0',
    payload: { sessionId: '01J0', pingedAt: '2026-09-13T12:00:00.000Z', pingCount: seq, nonce },
  };
}

describe('the session stream store', () => {
  beforeEach(() => {
    useSessionStreamStore.getState().reset();
  });

  const apply = (frame: Envelope): void => useSessionStreamStore.getState().apply(frame);
  const state = (): ReturnType<typeof useSessionStreamStore.getState> =>
    useSessionStreamStore.getState();

  it('starts empty', () => {
    expect(state()).toMatchObject({ sessionId: null, lastSeq: 0, pongs: [] });
  });

  it('applies an event and remembers where it got to', () => {
    apply(pong(1));

    expect(state().lastSeq).toBe(1);
    expect(state().pongs).toHaveLength(1);
    expect(state().sessionId).toBe('01J0');
  });

  it('keeps events in the order they arrived', () => {
    apply(pong(1));
    apply(pong(2));

    expect(state().pongs.map((entry) => entry.seq)).toEqual([1, 2]);
  });

  it('discards an event the replay delivered again, so nothing duplicates', () => {
    apply(pong(1));
    apply(pong(2));

    apply(pong(1));
    apply(pong(2));

    expect(state().pongs).toHaveLength(2);
    expect(state().lastSeq).toBe(2);
  });

  it('discards an event at the sequence it already has', () => {
    apply(pong(5));

    apply(pong(5));

    expect(state().pongs).toHaveLength(1);
  });

  it('accepts the next sequence after a replay', () => {
    apply(pong(5));

    apply(pong(6));

    expect(state().pongs).toHaveLength(2);
  });

  it('ignores a frame that is not one of ours', () => {
    apply({ ...pong(1), type: 'session.started' });

    expect(state().pongs).toEqual([]);
  });

  it('clears everything on a gap, instead of stitching a partial hole', () => {
    apply(pong(1));
    apply(pong(2));

    state().reset();

    expect(state()).toMatchObject({ sessionId: null, lastSeq: 0, pongs: [] });
  });

  it('accepts the stream again from scratch after a reset', () => {
    apply(pong(9));
    state().reset();

    apply(pong(1));

    expect(state().pongs).toHaveLength(1);
  });
});
