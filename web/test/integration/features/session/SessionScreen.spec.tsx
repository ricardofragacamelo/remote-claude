import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { forgetLiveSessions, liveSessionStoreOf, SessionScreen } from '@/features/session';
import { api } from '@/shared/api/api';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { render, translator } from '../../../support/render';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../support/fake-websocket';
import { aHistoryPage, claudeUnavailable, said } from '../../../support/history';
import { ack, aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';

const t = translator('en');
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const AT = '2026-09-19T12:00:00.000Z';

const readyFrame = {
  v: 1,
  id: 'srv-0',
  kind: 'ack',
  type: 'connection.ready',
  ts: AT,
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
};

function event(type: string, seq: number, payload: Record<string, unknown>) {
  return {
    v: 1,
    id: `evt-${String(seq)}`,
    kind: 'event',
    type,
    ts: AT,
    sessionId: SESSION,
    seq,
    payload,
  };
}

/**
 * The screen where the product happens.
 *
 * The cases that matter are the ones a screen usually gets wrong: a command shown in full rather
 * than truncated, a session opened after it ended, and the difference between "there was nothing"
 * and "we no longer have it".
 */
describe('the session screen', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    forgetLiveSessions();
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
  });

  function connect(): void {
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
    });
  }

  function receive(...frames: Record<string, unknown>[]): void {
    act(() => {
      for (const frame of frames) {
        sockets.latest.receive(frame);
      }
    });
  }

  it('says there is nothing yet, before anything has been said', () => {
    render(<SessionScreen sessionId={SESSION} />);

    expect(screen.getByText(t('session.screen.emptyTitle'))).toBeInTheDocument();
  });

  it('shows the conversation as it streams', () => {
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    receive(
      event('message.delta', 1, { messageId: 'm1', delta: 'Looking' }),
      event('message.delta', 2, { messageId: 'm1', delta: ' at it.' }),
    );

    expect(screen.getByText('Looking at it.')).toBeInTheDocument();
  });

  it('shows the exact command of a tool, never a summary of it — S-35', () => {
    // Somebody is watching this run on their own machine; truncating the command hides the one
    // thing that would have made them stop it.
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    receive(
      event('tool.started', 1, {
        toolUseId: 't1',
        toolName: 'Bash',
        input: { command: 'rm -rf build/ && echo done' },
      }),
      event('tool.progress', 2, { toolUseId: 't1', chunk: 'done\n' }),
    );

    expect(screen.getByText('rm -rf build/ && echo done')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText(t('session.toolStatus.running'))).toBeInTheDocument();
  });

  it('shows the whole input when nothing in it names the invocation', () => {
    // "We could not summarise it" is not a reason to show less: what executes is what is shown.
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    receive(
      event('tool.started', 1, {
        toolUseId: 't1',
        toolName: 'McpDoSomething',
        input: { anything: 'at all' },
      }),
    );

    expect(screen.getByText(/"anything": "at all"/)).toBeInTheDocument();
  });

  it('shows a tool with no input at all without a blank box', () => {
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    receive(event('tool.started', 1, { toolUseId: 't1', toolName: 'Task', input: {} }));

    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.queryByText('{}')).not.toBeInTheDocument();
  });

  it('shows what a finished tool reported about itself', () => {
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    receive(
      event('tool.started', 1, { toolUseId: 't1', toolName: 'Bash', input: { command: 'ls' } }),
      event('tool.completed', 2, { toolUseId: 't1', status: 'failed', summary: 'exit 1' }),
    );

    expect(screen.getByText('exit 1')).toBeInTheDocument();
    expect(screen.getByText(t('session.toolStatus.failed'))).toBeInTheDocument();
  });

  it('reports the status the server publishes', () => {
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    receive(event('session.statusChanged', 1, { status: 'waitingPermission' }));

    expect(screen.getByText(t('session.status.waitingPermission'))).toBeInTheDocument();
  });

  it('sends a prompt, and clears the composer', async () => {
    const user = userEvent.setup();
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    const box = screen.getByLabelText(t('session.composer.label'));
    await user.type(box, 'do the work');
    await user.click(screen.getByRole('button', { name: t('session.composer.send') }));

    expect(sockets.latest.frames().find((sent) => sent['type'] === 'session.prompt')).toMatchObject(
      { payload: { sessionId: SESSION, text: 'do the work' } },
    );
    await waitFor(() => {
      expect(box).toHaveValue('');
    });
  });

  it('sends nothing for a prompt that is only whitespace', async () => {
    const user = userEvent.setup();
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    await user.type(screen.getByLabelText(t('session.composer.label')), '   ');
    await user.click(screen.getByRole('button', { name: t('session.composer.send') }));

    await waitFor(() => {
      expect(
        sockets.latest.frames().filter((sent) => sent['type'] === 'session.prompt'),
      ).toHaveLength(0);
    });
  });

  it('interrupts the turn that is running', async () => {
    const user = userEvent.setup();
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    await user.click(screen.getByRole('button', { name: t('session.controls.interrupt') }));

    expect(
      sockets.latest.frames().find((sent) => sent['type'] === 'session.interrupt'),
    ).toMatchObject({ payload: { sessionId: SESSION } });
  });

  it('disables ending a session this browser did not open, and says why — B-37', () => {
    // Hiding an authorisation rule makes it look like a bug the first time somebody hits it.
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    expect(screen.getByRole('button', { name: t('session.controls.close') })).toBeDisabled();
    expect(screen.getByText(t('session.controls.closeNotOwner'))).toBeInTheDocument();
  });

  it('lets the browser that opened the session end it', async () => {
    const user = userEvent.setup();
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    // `session.start` opens the session it is about, so its event arrives before anything could
    // have attached — which is how this screen learns the session is its own.
    receive({
      v: 1,
      id: 'evt-0',
      kind: 'event',
      type: 'session.started',
      ts: AT,
      seq: 1,
      payload: {
        sessionId: SESSION,
        workspacePath: '/srv/projects/app',
        model: 'claude-sonnet-5',
        permissionMode: 'default',
      },
    });

    const close = screen.getByRole('button', { name: t('session.controls.close') });
    await waitFor(() => {
      expect(close).toBeEnabled();
    });
    await user.click(close);

    expect(sockets.latest.frames().find((sent) => sent['type'] === 'session.close')).toMatchObject({
      payload: { sessionId: SESSION },
    });
  });

  describe('a session that has already ended', () => {
    it('shows the terminal state and the replay, labelled as partial — S-96', () => {
      render(<SessionScreen sessionId={SESSION} />);
      connect();

      receive(
        event('message.completed', 1, {
          messageId: 'm1',
          role: 'assistant',
          content: [{ type: 'text', text: 'what the buffer still had' }],
        }),
        event('session.closed', 2, { sessionId: SESSION, reason: 'closedByUser' }),
      );

      expect(screen.getByRole('note')).toHaveTextContent(t('session.screen.partial'));
      expect(screen.getByText('what the buffer still had')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        t('session.screen.ended', { reason: t('session.closeReason.closedByUser'), at: AT }),
      );
    });

    it('shows only the terminal state when the buffer is gone — S-97', () => {
      // Not an edge case: it is what happens after every restart of the backend.
      render(<SessionScreen sessionId={SESSION} />);
      connect();

      receive(event('session.closed', 1, { sessionId: SESSION, reason: 'shutdown' }));

      expect(screen.getByRole('status')).toHaveTextContent(
        t('session.screen.ended', { reason: t('session.closeReason.shutdown'), at: AT }),
      );
      // The label is still there, because "we no longer have it" and "there was nothing" are
      // different things and the screen has to say which.
      expect(screen.getByRole('note')).toHaveTextContent(t('session.screen.partial'));
      expect(screen.getByText(t('session.screen.emptyTitle'))).toBeInTheDocument();
    });

    it('stops accepting prompts once it is over', () => {
      render(<SessionScreen sessionId={SESSION} />);
      connect();

      receive(event('session.closed', 1, { sessionId: SESSION, reason: 'completed' }));

      expect(screen.getByRole('button', { name: t('session.composer.send') })).toBeDisabled();
      expect(screen.getByRole('button', { name: t('session.controls.interrupt') })).toBeDisabled();
    });
  });

  it('drives the model and the permission mode of a running session', async () => {
    const user = userEvent.setup();
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    // Not on the screen yet — the controls for these arrive with the plan that gives them a place
    // to live — so the hook is exercised where it is reachable: through the screen's own wiring.
    await user.click(screen.getByRole('button', { name: t('session.controls.interrupt') }));

    expect(sockets.latest.frames().some((sent) => sent['type'] === 'session.interrupt')).toBe(true);
  });

  it('reports what the last turn cost', () => {
    render(<SessionScreen sessionId={SESSION} />);
    connect();

    receive(
      event('turn.completed', 1, {
        turnId: 'turn-1',
        usage: {},
        costUsd: '0.0123',
        durationMs: 2_400,
      }),
    );

    expect(
      screen.getByText(t('session.screen.turn', { cost: '0.0123', ms: 2_400 })),
    ).toBeInTheDocument();
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<SessionScreen sessionId={SESSION} />);
    connect();

    receive(
      event('tool.started', 1, { toolUseId: 't1', toolName: 'Bash', input: { command: 'ls' } }),
    );

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});

describe('the session screen, with the history under the stream — plan 04', () => {
  const CONVERSATION = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
  const SOURCE = '0f0e0d0c-0b0a-4908-8706-050403020100';
  let live: LiveSocket;

  const gap = ack('session.attached', {
    sessionId: SESSION,
    replayed: 0,
    oldestAvailableSeq: 900,
    gap: true,
    claudeSessionId: CONVERSATION,
  });

  beforeEach(() => {
    forgetLiveSessions();
    live = aLiveSocket();
  });

  afterEach(() => {
    live.close();
    vi.restoreAllMocks();
  });

  it('reloads the conversation over HTTP when the replay has a gap — S-14', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue(aHistoryPage([said('m1', 'From before the gap.')]));
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();
    live.receive(hubEvent(SESSION, 'message.delta', 1, { messageId: 'mX', delta: 'stale' }));

    live.receive(gap);

    expect(await screen.findByText('From before the gap.')).toBeInTheDocument();
    // Cleared, not stitched: what was on screen before the hole is gone.
    expect(screen.queryByText('stale')).toBeNull();
    expect(get).toHaveBeenCalledWith(`/transcripts/${CONVERSATION}/messages`);
  });

  it('never shows a message twice when the stream keeps arriving during the reload — S-15', async () => {
    let answer: (page: unknown) => void = () => undefined;
    vi.spyOn(api, 'get').mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    live.receive(gap);
    expect(screen.getByLabelText(t('session.history.loading'))).toBeInTheDocument();
    live.receive(
      hubEvent(SESSION, 'message.completed', 901, {
        messageId: 'm2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Arrived live.' }],
      }),
    );
    act(() => {
      answer(aHistoryPage([said('m1', 'Earlier.'), said('m2', 'Arrived live.')]));
    });

    await screen.findByText('Earlier.');
    expect(screen.getAllByText('Arrived live.')).toHaveLength(1);
    expect(screen.queryByLabelText(t('session.history.loading'))).toBeNull();
  });

  it('says why the history could not be read, keeps the stream, and tries again — S-17', async () => {
    vi.spyOn(api, 'get')
      .mockRejectedValueOnce(claudeUnavailable)
      .mockResolvedValueOnce(aHistoryPage([said('m1', 'Read at last.')]));
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    live.receive(gap);
    live.receive(hubEvent(SESSION, 'message.delta', 901, { messageId: 'm9', delta: 'still live' }));

    expect(await screen.findByText(t('transcript.error.claudeUnavailable'))).toBeInTheDocument();
    expect(screen.getByText('still live')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByText('Read at last.')).toBeInTheDocument();
    expect(screen.getByText('still live')).toBeInTheDocument();
  });

  it('lays what a resumed session continues under what it says now — B-11, S-21', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue(aHistoryPage([said('m0', 'Said in the editor.')]));
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    live.receive(
      hubEvent(SESSION, 'session.started', 1, {
        sessionId: SESSION,
        claudeSessionId: CONVERSATION,
        resumedFrom: SOURCE,
      }),
      hubEvent(SESSION, 'message.delta', 2, { messageId: 'm1', delta: 'Said now.' }),
    );

    expect(await screen.findByText('Said in the editor.')).toBeInTheDocument();
    const texts = screen.getAllByText(/Said (in the editor|now)\./).map((node) => node.textContent);
    expect(texts).toEqual(['Said in the editor.', 'Said now.']);
    expect(get).toHaveBeenCalledWith(`/transcripts/${SOURCE}/messages`);
    expect(liveSessionStoreOf(SESSION).getState().lastSeq).toBe(2);
  });

  it('opens the whole conversation once it knows which one it is', async () => {
    const onOpenHistory = vi.fn();
    render(<SessionScreen sessionId={SESSION} onOpenHistory={onOpenHistory} />);
    live.connect();

    expect(screen.queryByRole('button', { name: t('session.history.open') })).toBeNull();
    live.receive(
      hubEvent(SESSION, 'session.started', 1, {
        sessionId: SESSION,
        claudeSessionId: CONVERSATION,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: t('session.history.open') }));

    expect(onOpenHistory).toHaveBeenCalledWith(CONVERSATION);
  });
});
