import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchHistoryPage,
  toConversationSummary,
  transcriptPath,
} from '@/features/session/services/history.service';
import { api } from '@/shared/api/api';
import {
  aConversationDto,
  aHistoryPage,
  conversationRef,
  ENGINE,
  OURS,
  said,
  WORKSPACE,
  WRITTEN,
} from '../../../../support/history';

afterEach(() => {
  vi.restoreAllMocks();
});

const REF = conversationRef(OURS);

describe('fetchHistoryPage — plan 04, B-07', () => {
  it('asks for the latest messages when given no cursor', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([]));

    await fetchHistoryPage(REF, null);

    expect(get).toHaveBeenCalledWith(`/transcripts/${ENGINE}/${OURS}/messages`);
  });

  it('asks for the page before a cursor, exactly as the server handed it out', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([]));

    await fetchHistoryPage(REF, 'a/b c');

    expect(get).toHaveBeenCalledWith(`/transcripts/${ENGINE}/${OURS}/messages?cursor=a%2Fb%20c`);
  });

  it('sends the folder it already knows, as a hint, never on its own — S-163', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([]));

    await fetchHistoryPage(REF, null, '/srv/projects/app');

    expect(get).toHaveBeenCalledWith(
      `/transcripts/${ENGINE}/${OURS}/messages?workspacePath=%2Fsrv%2Fprojects%2Fapp`,
    );
  });

  it('sends the cursor and the folder together, the cursor first', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([]));

    await fetchHistoryPage(REF, 'a/b c', '/srv/projects/app');

    expect(get).toHaveBeenCalledWith(
      `/transcripts/${ENGINE}/${OURS}/messages?cursor=a%2Fb%20c&workspacePath=%2Fsrv%2Fprojects%2Fapp`,
    );
  });

  it('answers the conversation, its events and the cursor of the page before', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')], { nextCursor: 'm0' }));

    expect(await fetchHistoryPage(REF, null)).toEqual({
      conversation: {
        conversation: { engine: ENGINE, id: OURS },
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

    expect((await fetchHistoryPage(REF, null)).lastMessageId).toBe('u-41');
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

    expect((await fetchHistoryPage(REF, null)).events).toEqual([said('m1', 'kept')]);
  });

  it('reads a page with no events and no cursor as the whole of a silent conversation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ session: aConversationDto(), events: 'nope' });

    expect(await fetchHistoryPage(REF, null)).toMatchObject({ events: [], nextCursor: null });
  });

  it('refuses a page that does not say which conversation it is', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ events: [] });

    await expect(fetchHistoryPage(REF, null)).rejects.toThrow(TypeError);
  });
});

describe('transcriptPath — plan 28, B-13', () => {
  it('names the engine and the id of the conversation, then the rest, every part escaped', () => {
    expect(transcriptPath({ engine: 'en/g', id: 'a b' }, 'tools', 't?1', 'result')).toBe(
      '/transcripts/en%2Fg/a%20b/tools/t%3F1/result',
    );
  });
});

describe('toConversationSummary', () => {
  it('keeps the two fields of the conversation, and nothing else the server adds to it', () => {
    expect(
      toConversationSummary(
        aConversationDto({ conversation: { engine: ENGINE, id: OURS, extra: true } }),
      )?.conversation,
    ).toEqual({ engine: ENGINE, id: OURS });
  });

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
    ['no conversation', aConversationDto({ conversation: undefined })],
    ['the id alone of the previous protocol', aConversationDto({ conversation: OURS })],
    ['a conversation with no engine', aConversationDto({ conversation: { engine: '', id: OURS } })],
    ['a conversation with no id', aConversationDto({ conversation: { engine: ENGINE, id: '' } })],
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

    expect((await fetchHistoryPage(REF, null)).conversation).toMatchObject({
      activity: 'liveHere',
      liveSessionId: 'live-1',
      writtenAgoSeconds: 12,
    });
  });

  it('reads an activity it does not know as idle', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      aHistoryPage([], { session: aConversationDto({ activity: 'dreaming' }) }),
    );

    expect((await fetchHistoryPage(REF, null)).conversation.activity).toBe('idle');
  });
});
