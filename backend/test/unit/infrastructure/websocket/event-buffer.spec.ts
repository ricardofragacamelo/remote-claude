import { describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { EventBuffer } from '@infra/websocket/event-buffer';

const event = (seq: number): Envelope => ({
  v: 1,
  id: `id-${String(seq)}`,
  kind: 'event',
  type: 'diag.pong',
  ts: '2026-09-13T12:00:00.000Z',
  seq,
  payload: {},
});

/** A buffer holding `count` events, numbered from 1. */
function filled(capacity: number, count: number): EventBuffer {
  const buffer = new EventBuffer(capacity);

  for (let seq = 1; seq <= count; seq += 1) {
    buffer.append('s1', event(seq));
  }

  return buffer;
}

describe('EventBuffer', () => {
  it('replays nothing, and reports no gap, when the client asks for no resume', () => {
    expect(filled(10, 3).since('s1', null)).toEqual({
      events: [],
      oldestAvailableSeq: 1,
      gap: false,
    });
  });

  it('replays what came after the sequence the client already has', () => {
    const replay = filled(10, 5).since('s1', 3);

    expect(replay.events.map((frame) => frame.seq)).toEqual([4, 5]);
    expect(replay.gap).toBe(false);
  });

  it('replays nothing when the client is already up to date', () => {
    expect(filled(10, 5).since('s1', 5).events).toEqual([]);
  });

  it('replays nothing for a session it has never seen', () => {
    expect(new EventBuffer(10).since('unknown', 3)).toEqual({
      events: [],
      oldestAvailableSeq: 0,
      gap: false,
    });
  });

  it('drops the oldest once it is full', () => {
    const buffer = filled(3, 5);

    // Only 3, 4 and 5 survive; asking from 2 is asking for exactly what is left.
    expect(buffer.since('s1', 2).events.map((frame) => frame.seq)).toEqual([3, 4, 5]);
  });

  it('reports a gap to a client that wanted everything from the start', () => {
    expect(filled(3, 5).since('s1', 0).gap).toBe(true);
  });

  it('reports a gap when the requested sequence has fallen out', () => {
    const replay = filled(3, 10).since('s1', 2);

    expect(replay).toEqual({ events: [], oldestAvailableSeq: 8, gap: true });
  });

  it('does not report a gap at the exact boundary of what it still holds', () => {
    // The buffer holds 8, 9, 10; a client that has 7 is asking for exactly what is left.
    const replay = filled(3, 10).since('s1', 7);

    expect(replay.gap).toBe(false);
    expect(replay.events.map((frame) => frame.seq)).toEqual([8, 9, 10]);
  });

  it('reports a gap one sequence below that boundary', () => {
    expect(filled(3, 10).since('s1', 6).gap).toBe(true);
  });

  it('keeps sessions apart', () => {
    const buffer = new EventBuffer(10);
    buffer.append('s1', event(1));
    buffer.append('s2', event(1));

    expect(buffer.since('s1', 0).events).toHaveLength(1);
    expect(buffer.since('s2', 0).events).toHaveLength(1);
  });

  it('forgets a session on request', () => {
    const buffer = filled(10, 3);

    buffer.forget('s1');

    expect(buffer.since('s1', 0).events).toEqual([]);
  });
});
