import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchHistoryPage,
  toConversationSummary,
} from '@/features/session/services/history.service';
import { api } from '@/shared/api/api';
import {
  aConversationDto,
  aHistoryPage,
  OURS,
  said,
  WORKSPACE,
  WRITTEN,
} from '../../../../support/history';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchHistoryPage — plan 04, B-07', () => {
  it('asks for the latest messages when given no cursor', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([]));

    await fetchHistoryPage(OURS, null);

    expect(get).toHaveBeenCalledWith(`/transcripts/${OURS}/messages`);
  });

  it('asks for the page before a cursor, exactly as the server handed it out', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([]));

    await fetchHistoryPage(OURS, 'a/b c');

    expect(get).toHaveBeenCalledWith(`/transcripts/${OURS}/messages?cursor=a%2Fb%20c`);
  });

  it('answers the conversation, its events and the cursor of the page before', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')], { nextCursor: 'm0' }));

    expect(await fetchHistoryPage(OURS, null)).toEqual({
      conversation: {
        conversationId: OURS,
        summary: 'Fix the flaky test',
        origin: 'ours',
        cwd: WORKSPACE,
        gitBranch: null,
        lastModified: WRITTEN,
        // A backend that does not say what it is doing reads as history: nothing is promised live.
        activity: 'idle',
        liveSessionId: null,
        writtenAgoSeconds: null,
      },
      events: [said('m1', 'hi')],
      nextCursor: 'm0',
      // A server older than plan 22 does not say where the conversation ends.
      lastMessageId: null,
    });
  });

  it('says where the conversation ends, for following it from there — plan 22, B-22', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      ...aHistoryPage([said('m1', 'hi')]),
      lastMessageId: 'u-41',
    });

    expect((await fetchHistoryPage(OURS, null)).lastMessageId).toBe('u-41');
  });

  it('drops an event it cannot read, and keeps the rest', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      aHistoryPage([
        said('m1', 'kept'),
        { type: 'message.completed' } as never,
        { payload: {} } as never,
        null as never,
      ]),
    );

    expect((await fetchHistoryPage(OURS, null)).events).toEqual([said('m1', 'kept')]);
  });

  it('reads a page with no events and no cursor as the whole of a silent conversation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ session: aConversationDto(), events: 'nope' });

    expect(await fetchHistoryPage(OURS, null)).toMatchObject({ events: [], nextCursor: null });
  });

  it('refuses a page that does not say which conversation it is', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ events: [] });

    await expect(fetchHistoryPage(OURS, null)).rejects.toThrow(TypeError);
  });
});

describe('toConversationSummary', () => {
  it('reads what the backend describes, empty summary included', () => {
    expect(
      toConversationSummary(
        aConversationDto({ summary: '', gitBranch: 'main', origin: 'external' }),
      ),
    ).toMatchObject({
      summary: '',
      gitBranch: 'main',
      origin: 'external',
    });
  });

  it.each([
    ['not an object', 'nope'],
    ['no id', aConversationDto({ sessionId: undefined })],
    ['no working directory', aConversationDto({ cwd: '' })],
    ['no date', aConversationDto({ lastModified: 3 })],
    ['an origin nobody said', aConversationDto({ origin: 'vscode' })],
  ])('refuses one with %s', (_case, value) => {
    expect(toConversationSummary(value)).toBeNull();
  });
});

describe('what a conversation is doing — plan 08, B-08', () => {
  it('reads the activity, the live session and how long ago it was written', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      aHistoryPage([], {
        session: aConversationDto({
          activity: 'liveHere',
          liveSessionId: 'live-1',
          writtenAgoSeconds: 12,
        }),
      }),
    );

    expect((await fetchHistoryPage(OURS, null)).conversation).toMatchObject({
      activity: 'liveHere',
      liveSessionId: 'live-1',
      writtenAgoSeconds: 12,
    });
  });

  it('reads an activity it does not know as idle', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      aHistoryPage([], { session: aConversationDto({ activity: 'dreaming' }) }),
    );

    expect((await fetchHistoryPage(OURS, null)).conversation.activity).toBe('idle');
  });
});
