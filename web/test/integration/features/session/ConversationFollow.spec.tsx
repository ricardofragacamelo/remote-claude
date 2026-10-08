import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ConversationReader } from '@/features/session';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';
import {
  aConversationDto,
  aHistoryPage,
  claudeUnavailable,
  EDITOR,
  said,
} from '../../../support/history';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';

const t = translator('en');
const AT = '2026-10-07T12:00:00.000Z';
const LIVE = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

/** The pill's name, however many it counts. */
const GO_TO_END = new RegExp(`^${t('history.follow.newerLabel', { newer: '' })}`);

/** The observers of sizes the frame made — jsdom lays nothing out, so the test says when sizes change. */
const observed = vi.hoisted(() => new Set<() => void>());

class ObservedSizes {
  constructor(private readonly changed: () => void) {}
  observe(): void {
    observed.add(this.changed);
  }
  unobserve(): void {
    observed.delete(this.changed);
  }
  disconnect(): void {
    observed.delete(this.changed);
  }
}

function grew(): void {
  act(() => {
    for (const changed of [...observed]) changed();
  });
}

/** A page of a conversation begun in the editor, with where it ends. */
function aPage(
  events: Parameters<typeof aHistoryPage>[0],
  options: { lastMessageId?: string | null; activity?: string; nextCursor?: string | null } = {},
): Record<string, unknown> {
  return {
    ...aHistoryPage(events, {
      session: aConversationDto({
        sessionId: EDITOR,
        origin: 'external',
        activity: options.activity ?? 'activeElsewhere',
      }),
      nextCursor: options.nextCursor ?? null,
    }),
    lastMessageId: options.lastMessageId === undefined ? 'u-41' : options.lastMessageId,
  };
}

/** One block of a reply, with its identity — the CLI writes a reply a block per entry. */
function block(
  messageId: string,
  blockId: string,
  content: Record<string, unknown>,
): { type: string; payload: Record<string, unknown> } {
  return {
    type: 'message.completed',
    payload: { messageId, role: 'assistant', content: [{ ...content, blockId }] },
  };
}

function mount() {
  const onResumed = vi.fn();
  const view = render(
    <ConversationReader
      conversationId={EDITOR}
      onResumed={onResumed}
      onClose={vi.fn()}
      folder="/f"
    />,
  );
  return { ...view, onResumed };
}

/** The frames of the conversation the reader follows, as the gateway sends them. */
function follower(socket: LiveSocket) {
  return {
    asked: () => socket.lastSent('transcript.follow'),
    follows: () => socket.sent().filter((frame) => frame['type'] === 'transcript.follow'),
    following(followId = 't1', activity = 'activeElsewhere') {
      socket.receive({
        v: 1,
        id: `ack-${followId}`,
        kind: 'ack',
        type: 'transcript.following',
        ts: AT,
        correlationId: socket.lastSent('transcript.follow')?.['id'],
        payload: { followId, conversationId: EDITOR, activity },
      });
    },
    appended(followId: string, seq: number, payload: Record<string, unknown> = {}) {
      socket.receive({
        v: 1,
        id: `evt-${followId}-${String(seq)}`,
        kind: 'event',
        type: 'transcript.appended',
        ts: AT,
        seq,
        payload: {
          followId,
          conversationId: EDITOR,
          events: [],
          activity: 'activeElsewhere',
          working: false,
          ...payload,
        },
      });
    },
    reset(followId: string, seq: number, reason: string) {
      socket.receive({
        v: 1,
        id: `evt-${followId}-${String(seq)}`,
        kind: 'event',
        type: 'transcript.reset',
        ts: AT,
        seq,
        payload: { followId, conversationId: EDITOR, reason },
      });
    },
  };
}

/** Whether the page is on screen, as the browser tells it. */
function pageIs(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** The texts of the conversation, in the order they are drawn. */
function texts(pattern: RegExp): (string | null)[] {
  return screen.getAllByText(pattern).map((node) => node.textContent);
}

/** Plan 22, F3 — the reader that follows a conversation written in another client. */
describe('a conversation followed while it is read', () => {
  let socket: LiveSocket;
  let follow: ReturnType<typeof follower>;

  beforeEach(() => {
    observed.clear();
    vi.stubGlobal('ResizeObserver', ObservedSizes);
    socket = aLiveSocket();
    socket.connect();
    follow = follower(socket);
  });

  afterEach(() => {
    socket.close();
    pageIs('visible');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('following it — B-21, B-22', () => {
    it('follows from where the page ends, and adds what arrives after it — S-74, S-77', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aPage([said('m1', 'first')]));
      mount();

      await screen.findByText('first');
      await waitFor(() => {
        expect(follow.asked()?.['payload']).toEqual({
          conversationId: EDITOR,
          afterMessageId: 'u-41',
        });
      });

      follow.following();
      follow.appended('t1', 1, {
        events: [said('m2', 'second', 'user'), said('m3', 'third')],
        lastMessageId: 'u-44',
      });

      expect(await screen.findByText('third')).toBeInTheDocument();
      expect(texts(/^(first|second|third)$/)).toEqual(['first', 'second', 'third']);
    });

    it('reads the latest page again on a reset, lets go of what it added, and follows anew — S-78', async () => {
      const get = vi
        .spyOn(api, 'get')
        .mockResolvedValueOnce(aPage([said('m1', 'before the rewind')]))
        .mockResolvedValueOnce(aPage([said('m9', 'after the rewind')], { lastMessageId: 'u-90' }));
      mount();
      await screen.findByText('before the rewind');
      await waitFor(() => expect(follow.asked()).toBeDefined());
      follow.following();
      follow.appended('t1', 1, { events: [said('m2', 'rewound away')], lastMessageId: 'u-44' });
      await screen.findByText('rewound away');

      follow.reset('t1', 2, 'rewritten');

      expect(await screen.findByText('after the rewind')).toBeInTheDocument();
      expect(screen.queryByText('rewound away')).toBeNull();
      expect(get).toHaveBeenCalledTimes(2);
      expect(get).toHaveBeenLastCalledWith(`/transcripts/${EDITOR}/messages`);
      await waitFor(() => {
        expect(follow.follows()).toHaveLength(2);
      });
      expect(follow.asked()?.['payload']).toEqual({
        conversationId: EDITOR,
        afterMessageId: 'u-90',
      });
      // The reset ended the subscription on the server: nothing to unfollow.
      expect(socket.lastSent('transcript.unfollow')).toBeUndefined();
    });

    it('treats a lost frame as a reset — S-76', async () => {
      const get = vi
        .spyOn(api, 'get')
        .mockResolvedValueOnce(aPage([said('m1', 'first')]))
        .mockResolvedValueOnce(
          aPage([said('m1', 'first'), said('m2', 'second')], { lastMessageId: 'u-50' }),
        );
      mount();
      await screen.findByText('first');
      await waitFor(() => expect(follow.asked()).toBeDefined());
      follow.following();

      follow.appended('t1', 2, { events: [said('m3', 'after a hole')] });

      expect(await screen.findByText('second')).toBeInTheDocument();
      expect(screen.queryByText('after a hole')).toBeNull();
      expect(get).toHaveBeenCalledTimes(2);
      expect(socket.lastSent('transcript.unfollow')?.['payload']).toEqual({ followId: 't1' });
      await waitFor(() => {
        expect(follow.asked()?.['payload']).toMatchObject({ afterMessageId: 'u-50' });
      });
    });

    it('says why it no longer follows a conversation that is gone, and keeps what was read', async () => {
      vi.spyOn(api, 'get')
        .mockResolvedValueOnce(aPage([said('m1', 'still here')]))
        .mockRejectedValueOnce({
          code: 'NOT_FOUND',
          messageKey: 'transcript.error.notFound',
          params: {},
          traceId: 'trace-gone',
        });
      mount();
      await screen.findByText('still here');
      await waitFor(() => expect(follow.asked()).toBeDefined());
      follow.following();

      follow.reset('t1', 1, 'gone');

      expect(await screen.findByText(t('transcript.error.notFound'))).toBeInTheDocument();
      expect(screen.getByText('still here')).toBeInTheDocument();
      expect(follow.follows()).toHaveLength(1);
    });

    it('lets go while the tab is hidden, and follows again from the last entry it has — S-79', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aPage([said('m1', 'first')]));
      mount();
      await screen.findByText('first');
      await waitFor(() => expect(follow.asked()).toBeDefined());
      follow.following();
      follow.appended('t1', 1, { events: [said('m2', 'second')], lastMessageId: 'u-44' });
      await screen.findByText('second');

      pageIs('hidden');
      expect(socket.lastSent('transcript.unfollow')?.['payload']).toEqual({ followId: 't1' });

      pageIs('visible');
      await waitFor(() => {
        expect(follow.follows()).toHaveLength(2);
      });
      expect(follow.asked()?.['payload']).toEqual({
        conversationId: EDITOR,
        afterMessageId: 'u-44',
      });

      follow.following('t2');
      follow.appended('t2', 1, { events: [said('m3', 'third')], lastMessageId: 'u-47' });

      expect(await screen.findByText('third')).toBeInTheDocument();
      expect(texts(/^(first|second|third)$/)).toEqual(['first', 'second', 'third']);
    });

    it('follows again when the socket comes back, without a block twice — S-80', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aPage([said('m1', 'first')]));
      mount();
      await screen.findByText('first');
      await waitFor(() => expect(follow.asked()).toBeDefined());
      follow.following();
      follow.appended('t1', 1, {
        events: [block('m2', 'u-42:0', { type: 'text', text: 'one block' })],
        lastMessageId: 'u-42',
        working: true,
      });
      expect(await screen.findByText(t('history.follow.working'))).toBeInTheDocument();

      act(() => {
        socket.drop();
      });
      // A screen that no longer hears cannot say it still works.
      expect(screen.queryByText(t('history.follow.working'))).toBeNull();

      socket.connect();
      expect(follow.asked()?.['payload']).toEqual({
        conversationId: EDITOR,
        afterMessageId: 'u-42',
      });
      follow.following('t2');
      follow.appended('t2', 1, {
        events: [
          block('m2', 'u-42:0', { type: 'text', text: 'one block' }),
          block('m2', 'u-43:0', { type: 'text', text: 'another block' }),
        ],
        lastMessageId: 'u-43',
      });

      expect(await screen.findByText('another block')).toBeInTheDocument();
      expect(screen.getAllByText('one block')).toHaveLength(1);
    });

    it('says the ceiling of follows translated, and stays readable without following — S-81', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aPage([said('m1', 'readable')]));
      mount();
      await screen.findByText('readable');
      await waitFor(() => expect(follow.asked()).toBeDefined());

      socket.receive({
        v: 1,
        id: 'err-1',
        kind: 'error',
        type: 'error',
        ts: AT,
        correlationId: follow.asked()?.['id'],
        traceId: 'trace-limit',
        payload: {
          code: 'TRANSCRIPT_FOLLOW_LIMIT',
          messageKey: 'transcript.error.followLimit',
          params: { limit: 4, scope: 'connection' },
        },
      });

      expect(
        await screen.findByText(t('transcript.error.followLimit', { limit: 4 })),
      ).toBeInTheDocument();
      expect(screen.getByText('readable')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: t('history.screen.resume') })).toBeEnabled();
      expect(follow.follows()).toHaveLength(1);

      // Back on screen is worth another try — and a follow that holds clears the message.
      pageIs('hidden');
      pageIs('visible');
      await waitFor(() => {
        expect(follow.follows()).toHaveLength(2);
      });
      follow.following('t2');
      await waitFor(() => {
        expect(screen.queryByText(t('transcript.error.followLimit', { limit: 4 }))).toBeNull();
      });
    });

    it('reads an earlier page while updates arrive, losing and repeating nothing — S-82', async () => {
      let earlier: (page: unknown) => void = () => undefined;
      vi.spyOn(api, 'get')
        .mockResolvedValueOnce(aPage([said('m3', 'third')], { nextCursor: 'c3' }))
        .mockReturnValueOnce(
          new Promise((resolve) => {
            earlier = resolve;
          }),
        );
      mount();
      await screen.findByText('third');
      await waitFor(() => expect(follow.asked()).toBeDefined());
      follow.following();

      await userEvent.click(screen.getByRole('button', { name: t('history.screen.loadEarlier') }));
      follow.appended('t1', 1, { events: [said('m4', 'fourth')], lastMessageId: 'u-44' });
      await screen.findByText('fourth');
      await act(async () => {
        earlier(aPage([said('m1', 'first'), said('m2', 'second')], { lastMessageId: 'u-44' }));
        await Promise.resolve();
      });

      await screen.findByText('first');
      expect(texts(/^(first|second|third|fourth)$/)).toEqual([
        'first',
        'second',
        'third',
        'fourth',
      ]);
      // The earlier page moved nothing: the follow goes on as it was.
      expect(follow.follows()).toHaveLength(1);
    });

    it('does not follow a conversation whose page could not be read', async () => {
      vi.spyOn(api, 'get').mockRejectedValue(claudeUnavailable);
      mount();

      await screen.findByText(t('transcript.error.claudeUnavailable'));

      expect(follow.asked()).toBeUndefined();
    });
  });

  describe('the reader — B-23', () => {
    /** The one scroller of the frame, with the sizes the test gives it. */
    function theScroller(
      container: HTMLElement,
      sizes: { scrollHeight: number; clientHeight: number },
    ) {
      const scroller = container.querySelector<HTMLElement>('[data-chat-scroller]');

      if (scroller === null) {
        throw new Error('the reader has no scroller');
      }

      Object.defineProperty(scroller, 'scrollHeight', { get: () => sizes.scrollHeight });
      Object.defineProperty(scroller, 'clientHeight', { get: () => sizes.clientHeight });
      return scroller;
    }

    async function followed() {
      vi.spyOn(api, 'get').mockResolvedValue(aPage([said('m1', 'first')]));
      const view = mount();
      await screen.findByText('first');
      await waitFor(() => expect(follow.asked()).toBeDefined());
      follow.following();
      return view;
    }

    it('keeps the end in view as it grows, with the reader at the end — S-83', async () => {
      const { container } = await followed();
      const sizes = { scrollHeight: 1_000, clientHeight: 200 };
      const scroller = theScroller(container, sizes);
      scroller.scrollTop = 800;
      fireEvent.scroll(scroller);

      follow.appended('t1', 1, { events: [said('m2', 'second')], lastMessageId: 'u-44' });
      await screen.findByText('second');
      sizes.scrollHeight = 1_400;
      grew();

      expect(scroller.scrollTop).toBe(1_400);
      expect(screen.queryByRole('button', { name: GO_TO_END })).toBeNull();
    });

    it('counts the new messages while the reader is scrolled up, and takes it to the end — S-84', async () => {
      const { container } = await followed();
      const sizes = { scrollHeight: 1_000, clientHeight: 200 };
      const scroller = theScroller(container, sizes);
      scroller.scrollTop = 100;
      fireEvent.scroll(scroller);

      follow.appended('t1', 1, {
        events: [
          said('m2', 'a question', 'user'),
          block('m3', 'u-43:0', { type: 'thinking', thinking: 'weighing it' }),
          block('m3', 'u-44:0', { type: 'text', text: 'an answer' }),
          // A reply with no block drawn — a tool call alone — is no message to read.
          {
            type: 'message.completed',
            payload: { messageId: 'm4', role: 'assistant', content: [] },
          },
        ],
        lastMessageId: 'u-44',
      });
      await screen.findByText('an answer');
      sizes.scrollHeight = 1_600;
      grew();

      // Two messages, though three blocks: the thinking and the answer are one reply.
      const two = t('history.follow.newer', { count: 2 });
      const pill = screen.getByRole('button', {
        name: t('history.follow.newerLabel', { newer: two }),
      });
      expect(pill).toHaveTextContent(two);
      expect(scroller.scrollTop).toBe(100);

      await userEvent.click(pill);

      expect(scroller.scrollTop).toBe(1_600);
      expect(screen.queryByRole('button', { name: GO_TO_END })).toBeNull();

      // Up again, and one more: one, said as one.
      scroller.scrollTop = 200;
      fireEvent.scroll(scroller);
      follow.appended('t1', 2, { events: [said('m5', 'one more', 'user')], lastMessageId: 'u-45' });
      await screen.findByText('one more');

      expect(screen.getByRole('button', { name: GO_TO_END })).toHaveTextContent(
        t('history.follow.newerOne'),
      );
    });

    it('does not count an earlier page read while scrolled up as new', async () => {
      vi.spyOn(api, 'get')
        .mockResolvedValueOnce(aPage([said('m3', 'third')], { nextCursor: 'c3' }))
        .mockResolvedValueOnce(aPage([said('m1', 'first'), said('m2', 'second')]));
      const { container } = mount();
      await screen.findByText('third');
      const scroller = theScroller(container, { scrollHeight: 1_000, clientHeight: 200 });
      scroller.scrollTop = 0;
      fireEvent.scroll(scroller);

      await userEvent.click(screen.getByRole('button', { name: t('history.screen.loadEarlier') }));
      await screen.findByText('first');

      expect(screen.queryByRole('button', { name: GO_TO_END })).toBeNull();
    });

    it('notes the conversation is active elsewhere as the updates say it — S-85', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aPage([said('m1', 'first')], { activity: 'idle' }));
      mount();
      await screen.findByText('first');
      expect(screen.queryByText(t('history.screen.activeElsewhereNote'))).toBeNull();
      await waitFor(() => expect(follow.asked()).toBeDefined());

      follow.following('t1', 'idle');
      follow.appended('t1', 1, { activity: 'activeElsewhere' });
      expect(await screen.findByText(t('history.screen.activeElsewhereNote'))).toBeInTheDocument();

      follow.appended('t1', 2, { activity: 'idle' });
      await waitFor(() => {
        expect(screen.queryByText(t('history.screen.activeElsewhereNote'))).toBeNull();
      });
    });

    it('says Claude seems to work in another client, as an inference, without taking the focus — S-86', async () => {
      await followed();
      const close = screen.getByRole('button', { name: t('history.screen.close') });
      close.focus();
      const region = screen.getByText(
        (_, node) =>
          node?.getAttribute('aria-live') === 'polite' && node.getAttribute('role') === 'status',
      );
      expect(region).toBeEmptyDOMElement();

      follow.appended('t1', 1, { working: true });

      expect(await within(region).findByText(t('history.follow.working'))).toBeInTheDocument();
      expect(close).toHaveFocus();

      // Why it says so is a press away, and not announced with it.
      const why = screen.getByRole('button', { name: t('history.follow.workingHelpLabel') });
      expect(why).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(why);
      expect(why).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(t('history.follow.workingHelp'))).toBeInTheDocument();
      expect(within(region).queryByText(t('history.follow.workingHelp'))).toBeNull();
      await userEvent.click(why);
      expect(screen.queryByText(t('history.follow.workingHelp'))).toBeNull();

      follow.appended('t1', 2, { working: false });
      await waitFor(() => {
        expect(region).toBeEmptyDOMElement();
      });
      expect(
        screen.queryByRole('button', { name: t('history.follow.workingHelpLabel') }),
      ).toBeNull();
    });

    it('has no accessibility violation while it says Claude works, with its help open', async () => {
      const { container } = await followed();
      follow.appended('t1', 1, { working: true });
      await userEvent.click(
        await screen.findByRole('button', { name: t('history.follow.workingHelpLabel') }),
      );

      expect(await axe(container)).toHaveNoViolations();
    });

    it('asks first, lets go of the follow, and becomes the live session — S-87', async () => {
      const { onResumed } = await followed();

      await userEvent.click(screen.getByRole('button', { name: t('history.screen.resume') }));
      await userEvent.click(
        await screen.findByRole('button', { name: t('sessions.fork.confirm') }),
      );

      const kinds = socket
        .sent()
        .map((frame) => frame['type'])
        .filter((type) => type === 'transcript.unfollow' || type === 'session.start');
      expect(kinds).toEqual(['transcript.unfollow', 'session.start']);
      expect(socket.lastSent('transcript.unfollow')?.['payload']).toEqual({ followId: 't1' });

      socket.receive(
        hubEvent(LIVE, 'session.started', 1, {
          sessionId: LIVE,
          claudeSessionId: '00000000-0000-4000-8000-000000000001',
          resumedFrom: EDITOR,
        }),
      );
      expect(onResumed).toHaveBeenCalledWith(LIVE);
      expect(follow.follows()).toHaveLength(1);
    });

    it('follows again when continuing it was refused', async () => {
      await followed();

      await userEvent.click(screen.getByRole('button', { name: t('history.screen.resume') }));
      await userEvent.click(
        await screen.findByRole('button', { name: t('sessions.fork.confirm') }),
      );
      socket.receive({
        v: 1,
        id: 'err-2',
        kind: 'error',
        type: 'error',
        ts: AT,
        correlationId: socket.lastSent('session.start')?.['id'],
        traceId: 'trace-full',
        payload: {
          code: 'SESSION_LIMIT_REACHED',
          messageKey: 'session.error.limitReached',
          params: { limit: 10 },
        },
      });

      await waitFor(() => {
        expect(follow.follows()).toHaveLength(2);
      });
    });
  });
});
