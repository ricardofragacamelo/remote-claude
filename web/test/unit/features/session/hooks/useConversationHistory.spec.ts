import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useConversationHistory } from '@/features/session/hooks/useConversationHistory';
import { conversationFrom } from '@/features/session/services/live-session.service';
import { api } from '@/shared/api/api';
import { aHistoryPage, OURS, said } from '../../../../support/history';
import { providers } from '../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

function aPage(
  events: Parameters<typeof aHistoryPage>[0],
  lastMessageId: string | null,
  nextCursor: string | null = null,
): Record<string, unknown> {
  return { ...aHistoryPage(events, { nextCursor }), lastMessageId };
}

/** A reply written a block per entry, as the CLI writes it — and as following hands it over. */
function block(messageId: string, blockId: string, text: string) {
  return {
    type: 'message.completed',
    payload: { messageId, role: 'assistant', content: [{ type: 'text', text, blockId }] },
  };
}

async function opened() {
  const view = renderHook(() => useConversationHistory(OURS), { wrapper: providers() });
  await waitFor(() => {
    expect(view.result.current.summary).not.toBeNull();
  });
  return view;
}

/** Plan 22, B-22 — the history with what following added. */
describe('useConversationHistory with what is followed', () => {
  it('says where the latest page ends, and nothing before it arrives', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(aPage([said('m1', 'hi')], 'u-41'));
    const view = renderHook(() => useConversationHistory(OURS), { wrapper: providers() });

    expect(view.result.current.base).toBeNull();
    expect(view.result.current.lastMessageId).toBeNull();
    await waitFor(() => {
      expect(view.result.current.base).toBe('u-41');
    });
    expect(view.result.current.lastMessageId).toBe('u-41');
  });

  it('folds pages and updates by the one reducer: the same as reading it all again — S-77', async () => {
    const page = [said('m1', 'question', 'user'), block('m2', 'u-2:0', 'first half')];
    const followed = [block('m2', 'u-3:0', 'second half'), said('m4', 'next', 'user')];
    vi.spyOn(api, 'get').mockResolvedValue(aPage(page, 'u-2'));
    const { result } = await opened();

    act(() => {
      result.current.append('u-2', { events: followed, lastMessageId: 'u-4', activity: 'idle' });
    });

    expect(result.current.conversation).toEqual(conversationFrom([...page, ...followed]));
    expect(result.current.lastMessageId).toBe('u-4');
    expect(result.current.base).toBe('u-2');
  });

  it('takes the activity of the most recent update, over the page — S-82', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(aPage([said('m1', 'hi')], 'u-1'));
    const { result } = await opened();
    expect(result.current.summary?.activity).toBe('idle');

    act(() => {
      result.current.append('u-1', {
        events: [],
        lastMessageId: null,
        activity: 'activeElsewhere',
      });
    });
    expect(result.current.summary?.activity).toBe('activeElsewhere');
    // An update with no entry leaves the last one known.
    expect(result.current.lastMessageId).toBe('u-1');

    act(() => {
      result.current.append('u-1', { events: [], lastMessageId: null, activity: 'idle' });
    });
    expect(result.current.summary?.activity).toBe('idle');
  });

  it('ignores what was followed after a page it no longer has', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(aPage([said('m1', 'hi')], 'u-1'));
    const { result } = await opened();

    act(() => {
      result.current.append('u-0', {
        events: [said('m9', 'stale')],
        lastMessageId: 'u-9',
        activity: 'activeElsewhere',
      });
    });

    expect(result.current.conversation).toEqual(conversationFrom([said('m1', 'hi')]));
    expect(result.current.lastMessageId).toBe('u-1');
    expect(result.current.summary?.activity).toBe('idle');
  });

  it('reads the latest page alone again on a restart, and lets go of what was followed', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce(aPage([said('m3', 'third')], 'u-3', 'c3'))
      .mockResolvedValueOnce(aPage([said('m1', 'first')], 'u-3'))
      .mockResolvedValueOnce(aPage([said('m5', 'rewritten')], 'u-5', 'c5'));
    const { result } = await opened();
    act(() => {
      result.current.loadEarlier();
    });
    await waitFor(() => {
      expect(result.current.conversation.messages).toHaveLength(2);
    });
    act(() => {
      result.current.append('u-3', {
        events: [said('m4', 'fourth')],
        lastMessageId: 'u-4',
        activity: 'activeElsewhere',
      });
    });

    let failure: unknown = 'unset';
    await act(async () => {
      failure = await result.current.restart();
    });

    expect(failure).toBeNull();
    expect(get).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenLastCalledWith(`/transcripts/${OURS}/messages`);
    expect(result.current.conversation).toEqual(conversationFrom([said('m5', 'rewritten')]));
    expect(result.current.lastMessageId).toBe('u-5');
    expect(result.current.hasEarlier).toBe(true);
  });

  it('answers why the latest page could not be read again', async () => {
    const gone = {
      code: 'NOT_FOUND',
      messageKey: 'transcript.error.notFound',
      params: {},
      traceId: 'trace-gone',
    };
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce(aPage([said('m1', 'hi')], 'u-1'))
      .mockRejectedValueOnce(gone);
    const { result } = await opened();

    let failure: unknown = null;
    await act(async () => {
      failure = await result.current.restart();
    });

    expect(failure).toEqual(gone);
    // What was read stays on screen.
    expect(result.current.conversation).toEqual(conversationFrom([said('m1', 'hi')]));
  });
});
