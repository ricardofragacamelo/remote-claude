import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { PermissionQueuePanel, usePermissionQueueStore } from '@/features/permission';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { render, translator } from '../../../support/render';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../support/fake-websocket';

const t = translator('en');
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

/** The instant every case starts at, so a countdown is a number and not a race. */
const NOW = new Date('2026-09-19T12:00:00.000Z');

const readyFrame = {
  v: 1,
  id: 'srv-0',
  kind: 'ack',
  type: 'connection.ready',
  ts: NOW.toISOString(),
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
};

/** The question, as the server asks it: a `request` frame, with no sequence. */
function requestFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    id: 'frame-1',
    kind: 'request',
    type: 'permission.requested',
    ts: NOW.toISOString(),
    sessionId: SESSION,
    payload: {
      requestId: 'req-1',
      toolUseId: 'toolu-1',
      toolName: 'Bash',
      title: 'permission.tool.Bash',
      description: 'rm -rf build/',
      input: { command: 'rm -rf build/' },
      riskHint: 'destructive',
      defaultToNo: true,
      expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
      suggestions: [
        { scope: 'once', labelKey: 'permission.scope.once' },
        { scope: 'session', labelKey: 'permission.scope.session' },
      ],
      ...overrides,
    },
  };
}

/**
 * The queue, through the screen.
 *
 * Every case here is one of the four rules of
 * docs/architecture/web/04-state-and-data.md#a-fila-de-permissão, and each of them closes a way of
 * being wrong that a person would notice: a card answered twice, a card that vanishes without
 * saying why, a countdown that asks for confirmation about something already over.
 */
describe('the permission queue', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    usePermissionQueueStore.getState().reset();
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
    vi.useRealTimers();
  });

  function connect(): void {
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
    });
  }

  function ask(overrides: Record<string, unknown> = {}): void {
    act(() => {
      sockets.latest.receive(requestFrame(overrides));
    });
  }

  it('shows nothing to decide before anything is asked', () => {
    render(<PermissionQueuePanel sessionId={SESSION} />);

    expect(screen.getByText(t('permission.queue.emptyTitle'))).toBeInTheDocument();
  });

  it('puts the exact command on screen, with the risk the backend derived', () => {
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask();

    expect(screen.getByText('rm -rf build/')).toBeInTheDocument();
    expect(screen.getByText(t('permission.risk.destructive'))).toBeInTheDocument();
    expect(screen.getByText(t('permission.tool.Bash'))).toBeInTheDocument();
  });

  it('falls back to a generic label for a tool it has no words for', () => {
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask({ toolName: 'McpDoSomething', title: 'permission.tool.McpDoSomething' });

    expect(
      screen.getByText(t('permission.tool.unknown', { tool: 'McpDoSomething' })),
    ).toBeInTheDocument();
  });

  it('answers as a response that names the request it answers', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask();

    await user.click(screen.getByRole('button', { name: t('permission.scope.once') }));

    const answer = sockets.latest.frames().find((sent) => sent['type'] === 'permission.resolve');

    expect(answer).toMatchObject({
      kind: 'response',
      correlationId: 'frame-1',
      payload: { requestId: 'req-1', decision: 'allow', scope: 'once' },
    });
  });

  it('sends a reason with a refusal, because the contract demands one', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask();

    await user.click(screen.getByRole('button', { name: t('permission.card.deny') }));

    const answer = sockets.latest.frames().find((sent) => sent['type'] === 'permission.resolve');

    expect(answer?.['payload']).toMatchObject({ decision: 'deny', reason: expect.any(String) });
  });

  it('takes no second click while an answer is in flight — S-70', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask();

    const allow = screen.getByRole('button', { name: t('permission.scope.once') });
    await user.click(allow);

    expect(allow).toBeDisabled();
    expect(screen.getByText(t('permission.card.sending'))).toBeInTheDocument();
    expect(
      sockets.latest.frames().filter((sent) => sent['type'] === 'permission.resolve'),
    ).toHaveLength(1);
  });

  it('lets the card go when the countdown reaches zero, without asking — S-71', () => {
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask({ expiresAt: new Date(NOW.getTime() + 1_000).toISOString() });

    expect(screen.getByRole('timer')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    // No dialogue and no confirmation: the deadline has already refused it on the server, and
    // asking about something that is over is asking about nothing.
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByText(t('permission.queue.emptyTitle'))).toBeInTheDocument();
  });

  it('drops a card resolved on another device, and says who resolved it — S-72', () => {
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-1',
        kind: 'event',
        type: 'permission.resolved',
        ts: NOW.toISOString(),
        sessionId: SESSION,
        seq: 1,
        payload: { requestId: 'req-1', decision: 'allow', auto: false, resolvedBy: 'auth|42' },
      });
    });

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        t('permission.queue.lastBy', { decision: t('permission.decision.allow'), who: 'auth|42' }),
      ),
    ).toBeInTheDocument();
  });

  it('says when the server decided by itself, rather than leaving a card to vanish', () => {
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-2',
        kind: 'event',
        type: 'permission.resolved',
        ts: NOW.toISOString(),
        sessionId: SESSION,
        seq: 1,
        payload: { requestId: 'req-1', decision: 'deny', auto: true },
      });
    });

    expect(
      screen.getByText(t('permission.queue.lastAuto', { decision: t('permission.decision.deny') })),
    ).toBeInTheDocument();
  });

  it('names nobody rather than a blank when the server said who without saying who', () => {
    // The contract requires `resolvedBy` whenever `auto` is false. A frame that breaks that rule
    // still has to render something rather than the word `undefined`.
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-3',
        kind: 'event',
        type: 'permission.resolved',
        ts: NOW.toISOString(),
        sessionId: SESSION,
        seq: 1,
        payload: { requestId: 'req-1', decision: 'allow', auto: false },
      });
    });

    expect(
      screen.getByText(
        t('permission.queue.lastBy', { decision: t('permission.decision.allow'), who: '' }),
      ),
    ).toBeInTheDocument();
  });

  it('asks for more time without choosing the number', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask();

    await user.click(screen.getByRole('button', { name: t('permission.card.extend') }));

    // The increment and the ceiling are the backend's: our timeout is the only protection against
    // a hung session, and a client that could choose that number could switch it off.
    expect(
      sockets.latest.frames().find((sent) => sent['type'] === 'permission.extend'),
    ).toMatchObject({ payload: { requestId: 'req-1' } });
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<PermissionQueuePanel sessionId={SESSION} />);
    connect();
    ask();

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
