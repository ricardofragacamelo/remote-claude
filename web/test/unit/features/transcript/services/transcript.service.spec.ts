import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchConversations } from '@/features/transcript/services/transcript.service';
import { api } from '@/shared/api/api';
import { aConversationDto, EDITOR, OURS, WORKSPACE } from '../../../../support/history';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchConversations — plan 04, B-06', () => {
  it('asks for the conversations of exactly one workspace — S-12', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ sessions: [], nextCursor: null });

    await fetchConversations(WORKSPACE, null);

    expect(get).toHaveBeenCalledWith('/transcripts?workspacePath=%2Fsrv%2Fprojects%2Fapp');
  });

  it('asks for the next page by the cursor the last one handed out', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ sessions: [], nextCursor: null });

    await fetchConversations(WORKSPACE, `1758800000000.${OURS}`);

    expect(get).toHaveBeenCalledWith(
      `/transcripts?workspacePath=%2Fsrv%2Fprojects%2Fapp&cursor=1758800000000.${OURS}`,
    );
  });

  it('answers each conversation with where it came from — S-11', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      sessions: [aConversationDto(), aConversationDto({ sessionId: EDITOR, origin: 'external' })],
      nextCursor: 'next',
    });

    const page = await fetchConversations(WORKSPACE, null);

    expect(page.conversations.map((each) => [each.conversationId, each.origin])).toEqual([
      [OURS, 'ours'],
      [EDITOR, 'external'],
    ]);
    expect(page.nextCursor).toBe('next');
  });

  it('drops a row it cannot read, and reads an answer without a list as an empty one', async () => {
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ sessions: [aConversationDto(), { sessionId: 3 }], nextCursor: 7 })
      .mockResolvedValueOnce({});

    expect(await fetchConversations(WORKSPACE, null)).toMatchObject({
      conversations: [{ conversationId: OURS }],
      nextCursor: null,
    });
    expect(await fetchConversations(WORKSPACE, null)).toEqual({
      conversations: [],
      nextCursor: null,
    });
  });
});
