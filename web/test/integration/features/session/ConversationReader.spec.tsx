import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
  OURS,
  said,
  WORKSPACE,
} from '../../../support/history';
import { ack, aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';

const t = translator('en');
const LIVE = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

function mount(conversationId = OURS) {
  const onResumed = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ConversationReader conversationId={conversationId} onResumed={onResumed} onClose={onClose} />,
  );
  return { ...view, onResumed, onClose };
}

/**
 * One conversation of the history, and continuing it — plan 04, B-07, B-08 and F2.
 *
 * The page is read through the same reducer as the live stream, reached back a page at a time, and
 * read from the cache when it is opened again. Continuing it goes over the socket, and the answer
 * is whichever of three frames the server chose.
 */
describe('the history of a conversation', () => {
  let socket: LiveSocket;

  beforeEach(() => {
    socket = aLiveSocket();
  });

  afterEach(() => {
    socket.close();
    vi.restoreAllMocks();
  });

  describe('reading it', () => {
    it('shows the loading state while the page is on its way', () => {
      vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
      mount();

      expect(screen.getByLabelText(t('history.screen.loading'))).toBeInTheDocument();
    });

    it('shows a failure translated, with a way to try again — S-17', async () => {
      const get = vi
        .spyOn(api, 'get')
        .mockRejectedValueOnce(claudeUnavailable)
        .mockResolvedValueOnce(aHistoryPage([said('m1', 'Back again')]));
      mount();

      expect(await screen.findByText(t('transcript.error.claudeUnavailable'))).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));

      expect(await screen.findByText('Back again')).toBeInTheDocument();
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('says so when nothing was said in it', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([]));
      mount();

      expect(await screen.findByText(t('history.screen.emptyTitle'))).toBeInTheDocument();
    });

    it('shows what was said, with the tools it ran, under the title it has', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(
        aHistoryPage([
          said('m1', 'Why does it fail?', 'user'),
          {
            type: 'tool.started',
            payload: { toolUseId: 't1', toolName: 'Bash', input: { command: 'pnpm test' } },
          },
          said('m2', 'Because of the clock.'),
        ]),
      );
      mount();

      expect(await screen.findByText('Because of the clock.')).toBeInTheDocument();
      expect(screen.getByText('Why does it fail?')).toBeInTheDocument();
      expect(
        screen.getByText(t('sessions.tool.bash', { command: 'pnpm test' })),
      ).toBeInTheDocument();
      expect(screen.getByText('Fix the flaky test')).toBeInTheDocument();
      expect(screen.getByText(t('history.origin.ours'))).toBeInTheDocument();
    });

    it('reaches back a page at a time, the older before the newer', async () => {
      const get = vi
        .spyOn(api, 'get')
        .mockResolvedValueOnce(aHistoryPage([said('m3', 'third')], { nextCursor: 'm3' }))
        .mockRejectedValueOnce(claudeUnavailable)
        .mockResolvedValueOnce(aHistoryPage([said('m1', 'first'), said('m2', 'second')]));
      mount();

      await userEvent.click(
        await screen.findByRole('button', { name: t('history.screen.loadEarlier') }),
      );
      // The failure is said beside the button, and what is already on screen stays.
      expect(await screen.findByRole('alert')).toHaveTextContent(
        t('transcript.error.claudeUnavailable'),
      );
      expect(screen.getByText('third')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: t('history.screen.loadEarlier') }));

      await screen.findByText('first');
      const texts = screen.getAllByText(/first|second|third/).map((node) => node.textContent);
      expect(texts).toEqual(['first', 'second', 'third']);
      expect(get).toHaveBeenLastCalledWith(`/transcripts/${OURS}/messages?cursor=m3`);
      expect(screen.queryByRole('button', { name: t('history.screen.loadEarlier') })).toBeNull();
    });

    it('searches the whole conversation by loading every page before — S-101', async () => {
      const user = userEvent.setup();
      const get = vi
        .spyOn(api, 'get')
        .mockResolvedValueOnce(aHistoryPage([said('m3', 'third clock')], { nextCursor: 'm3' }))
        .mockResolvedValueOnce(aHistoryPage([said('m2', 'second')], { nextCursor: 'm2' }))
        .mockResolvedValueOnce(aHistoryPage([said('m1', 'first clock')]));
      mount();
      const list = await screen.findByRole('list', { name: t('session.screen.conversation') });

      fireEvent.keyDown(list, { key: 'f', ctrlKey: true });
      await user.type(screen.getByRole('searchbox'), 'clock');
      expect(
        screen.getByText(t('sessions.search.position', { at: 1, count: 1 })),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: t('sessions.search.everything') }));

      expect(await screen.findByText('first clock', {}, { timeout: 5_000 })).toBeInTheDocument();
      expect(get).toHaveBeenCalledTimes(3);
      expect(
        screen.getByText(t('sessions.search.position', { at: 1, count: 2 })),
      ).toBeInTheDocument();
    });

    it('reads the cache when the same conversation is opened again — S-16', async () => {
      const get = vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'cached')]));
      const onResumed = vi.fn();
      const view = render(
        <ConversationReader conversationId={OURS} onResumed={onResumed} onClose={vi.fn()} />,
      );
      await screen.findByText('cached');

      view.rerender(<p aria-label="elsewhere" />);
      view.rerender(
        <ConversationReader conversationId={OURS} onResumed={onResumed} onClose={vi.fn()} />,
      );

      expect(await screen.findByText('cached')).toBeInTheDocument();
      expect(get).toHaveBeenCalledTimes(1);
    });
  });

  describe('continuing it', () => {
    it('continues it in the workspace it ran in, and goes to the session it became — S-19', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')]));
      const { onResumed } = mount();
      socket.connect();

      await userEvent.click(
        await screen.findByRole('button', { name: t('history.screen.resume') }),
      );

      expect(socket.lastSent('session.start')).toMatchObject({
        payload: { workspacePath: WORKSPACE, resumeSessionId: OURS },
      });
      expect(screen.getByRole('button', { name: t('history.screen.resuming') })).toBeDisabled();

      socket.receive(
        hubEvent(LIVE, 'session.started', 1, {
          sessionId: LIVE,
          claudeSessionId: OURS,
          resumedFrom: OURS,
        }),
      );

      expect(onResumed).toHaveBeenCalledWith(LIVE);
    });

    it('goes to the live session when the conversation was already live — S-24', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')]));
      const { onResumed } = mount();
      socket.connect();

      await userEvent.click(
        await screen.findByRole('button', { name: t('history.screen.resume') }),
      );
      socket.receive(
        ack('session.attached', {
          sessionId: LIVE,
          replayed: 0,
          oldestAvailableSeq: 1,
          gap: false,
          claudeSessionId: OURS,
          resumedFrom: OURS,
        }),
      );

      expect(onResumed).toHaveBeenCalledWith(LIVE);
    });

    it('says, before anything is pressed, that a conversation begun elsewhere forks — D-04', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(
        aHistoryPage([said('m1', 'hi')], {
          session: aConversationDto({ sessionId: EDITOR, origin: 'external' }),
        }),
      );
      const { onResumed } = mount(EDITOR);
      socket.connect();

      expect(await screen.findByText(t('history.screen.externalNote'))).toBeInTheDocument();
      expect(screen.getByText(t('history.origin.external'))).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: t('history.screen.resume') }));
      socket.receive(
        hubEvent(LIVE, 'session.started', 1, {
          sessionId: LIVE,
          claudeSessionId: '00000000-0000-4000-8000-000000000001',
          resumedFrom: EDITOR,
        }),
      );

      expect(onResumed).toHaveBeenCalledWith(LIVE);
    });

    it('does not say it about one of ours', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')]));
      mount();

      await screen.findByText('hi');

      expect(screen.queryByText(t('history.screen.externalNote'))).toBeNull();
    });

    it('shows a refusal translated, and lets it be tried again — B-13', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')]));
      const { onResumed } = mount();
      socket.connect();

      await userEvent.click(
        await screen.findByRole('button', { name: t('history.screen.resume') }),
      );
      const command = socket.lastSent('session.start');
      socket.receive({
        v: 1,
        id: 'err-1',
        kind: 'error',
        type: 'error',
        ts: '2026-09-19T12:00:00.000Z',
        correlationId: command?.['id'],
        traceId: 'trace-limit',
        payload: {
          code: 'SESSION_LIMIT_REACHED',
          messageKey: 'session.error.limitReached',
          params: { limit: 10 },
        },
      });

      expect(
        await screen.findByText(
          'This machine is already running 10 sessions, which is as many as it allows. End one and try again.',
        ),
      ).toBeInTheDocument();
      expect(onResumed).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: t('history.screen.resume') })).toBeEnabled();
    });

    it('ignores what answers something else', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')]));
      const { onResumed } = mount();
      socket.connect();

      await userEvent.click(
        await screen.findByRole('button', { name: t('history.screen.resume') }),
      );
      socket.receive(
        hubEvent(LIVE, 'session.started', 1, { sessionId: LIVE, claudeSessionId: EDITOR }),
      );

      expect(onResumed).not.toHaveBeenCalled();
    });

    it('cannot continue while the connection is not there, and says so', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')]));
      mount();

      const button = await screen.findByRole('button', { name: t('history.screen.resume') });

      expect(button).toBeDisabled();
      // Closed by the spec before it, or never opened: either way it is said, not left implied.
      expect(
        screen.getByText(
          new RegExp(`^(${t('connection.status.idle')}|${t('connection.status.closed')})$`),
        ),
      ).toBeInTheDocument();
    });

    it('sends one command for two quick clicks', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')]));
      mount();
      socket.connect();

      const button = await screen.findByRole('button', { name: t('history.screen.resume') });
      await userEvent.dblClick(button);

      await waitFor(() => {
        expect(socket.sent().filter((frame) => frame['type'] === 'session.start')).toHaveLength(1);
      });
    });
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      aHistoryPage([said('m1', 'hi')], {
        session: aConversationDto({ origin: 'external' }),
        nextCursor: 'm1',
      }),
    );
    const { container } = mount();

    await screen.findByText('hi');

    expect(await axe(container)).toHaveNoViolations();
  });
});

/** Plan 08, B-10 — the panel reads it, and asks before forking one that is being written now. */
describe('a conversation in the panel of its tab', () => {
  let socket: LiveSocket;

  beforeEach(() => {
    socket = aLiveSocket();
  });

  afterEach(() => {
    socket.close();
    vi.restoreAllMocks();
  });

  it('asks before continuing one that something else wrote a moment ago — S-42', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'get').mockResolvedValue(
      aHistoryPage([said('m1', 'hi')], {
        session: aConversationDto({
          sessionId: EDITOR,
          origin: 'external',
          activity: 'activeElsewhere',
        }),
      }),
    );
    socket.connect();
    mount(EDITOR);

    expect(await screen.findByText(t('history.screen.activeElsewhereNote'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('history.screen.resume') }));
    await user.click(await screen.findByRole('button', { name: t('sessions.fork.cancel') }));
    expect(socket.lastSent('session.start')).toBeUndefined();

    await user.click(screen.getByRole('button', { name: t('history.screen.resume') }));
    await user.click(await screen.findByRole('button', { name: t('sessions.fork.confirm') }));
    expect(socket.lastSent('session.start')?.['payload']).toMatchObject({
      resumeSessionId: EDITOR,
    });
  });

  it('closes when told', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')]));
    const { onClose } = mount();

    await userEvent.click(await screen.findByRole('button', { name: t('history.screen.close') }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
