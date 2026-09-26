import { describe, expect, it } from 'vitest';

import { pageFromTail, pageOfSessions, TranscriptCursorStaleError } from '@domain/transcript';
import {
  aTranscriptSession,
  conversationId,
  someMessages,
} from '../../../../support/builders/transcript.builder';

const ids = (page: { items: readonly { id: { value: string } }[] }): string[] =>
  page.items.map((session) => session.id.value);

describe('pageOfSessions', () => {
  const sessions = [
    aTranscriptSession({ id: 1, lastModified: 100 }),
    aTranscriptSession({ id: 2, lastModified: 300 }),
    aTranscriptSession({ id: 3, lastModified: 200 }),
  ];

  it('orders the most recently written first', () => {
    expect(ids(pageOfSessions(sessions, null, 10))).toEqual([
      conversationId(2),
      conversationId(3),
      conversationId(1),
    ]);
  });

  it('says there is no next page when everything fitted', () => {
    expect(pageOfSessions(sessions, null, 3).next).toBeNull();
  });

  it('hands out the last session of a full page as the cursor, and continues after it', () => {
    const first = pageOfSessions(sessions, null, 2);

    expect(first.next).toEqual({ lastModified: 200, id: conversationId(3) });
    expect(ids(pageOfSessions(sessions, first.next, 2))).toEqual([conversationId(1)]);
  });

  it('breaks a tie on `lastModified` by the id, so the cursor names exactly one — S-57', () => {
    const tied = [
      aTranscriptSession({ id: 1, lastModified: 500 }),
      aTranscriptSession({ id: 2, lastModified: 500 }),
      aTranscriptSession({ id: 3, lastModified: 500 }),
    ];
    const first = pageOfSessions(tied, null, 1);
    const second = pageOfSessions(tied, first.next, 1);
    const third = pageOfSessions(tied, second.next, 1);

    expect([...ids(first), ...ids(second), ...ids(third)]).toEqual([
      conversationId(3),
      conversationId(2),
      conversationId(1),
    ]);
    expect(third.next).toBeNull();
  });

  it('neither repeats nor skips when a session is written between two pages — S-57', () => {
    const first = pageOfSessions(sessions, null, 1);
    // The oldest conversation is written to: it moves to the top, above the window already read.
    const written = [
      aTranscriptSession({ id: 1, lastModified: 900 }),
      aTranscriptSession({ id: 2, lastModified: 300 }),
      aTranscriptSession({ id: 3, lastModified: 200 }),
    ];
    const rest = pageOfSessions(written, first.next, 10);

    expect([...ids(first), ...ids(rest)]).toEqual([conversationId(2), conversationId(3)]);
  });

  it('answers an empty page for an empty workspace', () => {
    expect(pageOfSessions([], null, 25)).toEqual({ items: [], next: null });
  });
});

describe('pageFromTail', () => {
  const messages = someMessages(5);
  const idsOf = (page: { items: readonly { id: string }[] }): string[] =>
    page.items.map((message) => message.id);

  it('starts from the latest messages, in chronological order — D-02', () => {
    const page = pageFromTail('s', messages, null, 2);

    expect(idsOf(page)).toEqual(['m4', 'm5']);
    expect(page.next).toBe('m4');
  });

  it('continues with what came before the cursor, until the first message — S-06', () => {
    const second = pageFromTail('s', messages, 'm4', 2);
    const third = pageFromTail('s', messages, String(second.next), 2);

    expect(idsOf(second)).toEqual(['m2', 'm3']);
    expect(idsOf(third)).toEqual(['m1']);
    expect(third.next).toBeNull();
  });

  it('says there is no next page when the whole conversation fitted', () => {
    expect(pageFromTail('s', messages, null, 5).next).toBeNull();
  });

  it('answers the same page for the same cursor — S-07', () => {
    expect(pageFromTail('s', messages, 'm4', 2)).toEqual(pageFromTail('s', messages, 'm4', 2));
  });

  it('is unmoved by messages appended while somebody pages — S-57', () => {
    const grown = [...messages, ...someMessages(3, 'n')];

    expect(idsOf(pageFromTail('s', grown, 'm4', 2))).toEqual(['m2', 'm3']);
  });

  it('answers an empty page, and no cursor, for an empty conversation — S-03', () => {
    expect(pageFromTail('s', [], null, 25)).toEqual({ items: [], next: null });
  });

  it('refuses a cursor whose message is no longer there — S-69', () => {
    expect(() => pageFromTail('s', messages, 'gone', 2)).toThrow(TranscriptCursorStaleError);
  });

  it('reports the stale cursor as INVALID_INPUT, with its own key', () => {
    expect.assertions(2);

    try {
      pageFromTail('s', messages, 'gone', 2);
    } catch (error) {
      expect((error as TranscriptCursorStaleError).code).toBe('INVALID_INPUT');
      expect((error as TranscriptCursorStaleError).messageKey).toBe('transcript.error.cursorStale');
    }
  });
});
