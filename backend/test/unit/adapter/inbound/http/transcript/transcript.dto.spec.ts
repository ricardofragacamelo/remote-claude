import { describe, expect, it } from 'vitest';

import {
  listTranscriptsSchema,
  MAX_PAGE_SIZE,
  readTranscriptSchema,
  toSessionListCursor,
  toTranscriptListDto,
  toTranscriptPageDto,
  toTranscriptSessionDto,
  transcriptIdSchema,
} from '@adapter/inbound/http/transcript/transcript.dto';
import {
  aTranscriptSession,
  conversationId,
  someMessages,
} from '../../../../../support/builders/transcript.builder';

describe('the transcript transport shapes', () => {
  describe('the listing query', () => {
    it('takes a path, a cursor it handed out and a size', () => {
      const cursor = `1758800000000.${conversationId(1)}`;

      expect(
        listTranscriptsSchema.parse({ workspacePath: '/srv/projects', cursor, limit: '10' }),
      ).toEqual({ workspacePath: '/srv/projects', cursor, limit: 10 });
    });

    it.each([
      ['no path', {}],
      ['an empty path', { workspacePath: '' }],
      ['a cursor it never handed out', { workspacePath: '/p', cursor: '12.nope' }],
      ['a cursor with a leading zero', { workspacePath: '/p', cursor: `012.${conversationId(1)}` }],
      ['a page of none', { workspacePath: '/p', limit: '0' }],
      ['a page above the ceiling', { workspacePath: '/p', limit: String(MAX_PAGE_SIZE + 1) }],
    ])('refuses %s', (_case, query) => {
      expect(listTranscriptsSchema.safeParse(query).success).toBe(false);
    });
  });

  describe('the conversation query', () => {
    it('takes a message id as the cursor', () => {
      expect(readTranscriptSchema.parse({ cursor: conversationId(3) })).toEqual({
        cursor: conversationId(3),
      });
    });

    it('refuses a cursor that is not a message id, and an id that is not a conversation', () => {
      expect(readTranscriptSchema.safeParse({ cursor: 'm1' }).success).toBe(false);
      expect(transcriptIdSchema.safeParse('01J0ABCDEFGHJKMNPQRSTVWXYZ').success).toBe(false);
    });
  });

  describe('the listing cursor', () => {
    it('round-trips through the opaque string the client sees', () => {
      const dto = toTranscriptListDto({
        items: [],
        next: { lastModified: 1_758_800_000_000, id: conversationId(1) },
      });

      expect(toSessionListCursor(dto.nextCursor ?? undefined)).toEqual({
        lastModified: 1_758_800_000_000,
        id: conversationId(1),
      });
    });

    it('is absent when none was sent, and when what was sent is not one', () => {
      expect(toSessionListCursor(undefined)).toBeNull();
      expect(toSessionListCursor('nope')).toBeNull();
    });
  });

  it('shows a conversation with its origin, and its instants as ISO strings', () => {
    expect(
      toTranscriptSessionDto({
        ...aTranscriptSession({
          id: 1,
          gitBranch: 'main',
          createdAt: new Date('2026-09-20T10:00:00.000Z'),
          lastModified: Date.parse('2026-09-25T10:00:00.000Z'),
        }),
        origin: 'ours',
      }),
    ).toEqual({
      sessionId: conversationId(1),
      summary: 'a conversation',
      origin: 'ours',
      cwd: '/srv/projects/app',
      gitBranch: 'main',
      createdAt: '2026-09-20T10:00:00.000Z',
      lastModified: '2026-09-25T10:00:00.000Z',
    });
  });

  it('never shows a missing directory as `null`', () => {
    // Not reachable through the use case, which hides such a conversation; the shape stays total.
    expect(
      toTranscriptSessionDto({ ...aTranscriptSession({ cwd: null }), origin: 'external' }).cwd,
    ).toBe('');
  });

  it('flattens a page into the events of its messages, oldest first — B-03', () => {
    const dto = toTranscriptPageDto({
      session: { ...aTranscriptSession(), origin: 'external' },
      page: { items: someMessages(2), next: 'm1' },
    });

    expect(dto.events.map((event) => event.payload['messageId'])).toEqual(['m1', 'm2']);
    expect(dto.nextCursor).toBe('m1');
  });
});
