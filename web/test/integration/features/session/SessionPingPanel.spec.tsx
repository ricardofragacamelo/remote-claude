import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { SessionPingPanel } from '@/features/session';
import { useSessionStreamStore } from '@/features/session';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { render, translator } from '../../../support/render';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../support/fake-websocket';

const t = translator('en');

/** A server frame, in the shape the gateway sends it. */
function frame(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    v: 1,
    id: 'srv-1',
    kind: 'event',
    type: 'session.pong',
    ts: '2026-09-13T12:00:00.000Z',
    ...overrides,
  };
}

const readyFrame = frame({
  kind: 'ack',
  type: 'connection.ready',
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
});

describe('the round-trip screen', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    useSessionStreamStore.getState().reset();
    // The client refuses to open a socket it cannot authenticate, which is the behaviour under
    // test elsewhere; here the visitor is signed in.
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
  });

  /** Brings the connection up, as the providers would. */
  function connect(): void {
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
    });
  }

  /** Delivers a pong for the nonce the screen just sent. */
  function answer(seq: number, pingCount: number): void {
    const sent = sockets.latest.frames().at(-1);
    const payload = sent?.['payload'] as { nonce: string };

    act(() => {
      sockets.latest.receive(
        frame({
          seq,
          sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
          payload: {
            sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
            pingedAt: '2026-09-13T12:00:05.000Z',
            pingCount,
            nonce: payload.nonce,
          },
        }),
      );
    });
  }

  it('shows the empty state before anything has been sent', () => {
    render(<SessionPingPanel />);

    expect(screen.getByText(t('session.ping.empty'))).toBeInTheDocument();
  });

  it('will not let a command be sent while the socket is down', () => {
    render(<SessionPingPanel />);

    expect(screen.getByRole('button', { name: t('session.ping.action') })).toBeDisabled();
  });

  it('shows the connection state, translated, once it is ready', () => {
    render(<SessionPingPanel />);

    connect();

    expect(screen.getByTestId('connection-status')).toHaveTextContent(t('connection.status.ready'));
  });

  it('enables the action once the connection is ready', () => {
    render(<SessionPingPanel />);

    connect();

    expect(screen.getByRole('button', { name: t('session.ping.action') })).toBeEnabled();
  });

  it('disables it again when the connection goes away', () => {
    render(<SessionPingPanel />);
    connect();

    act(() => {
      wsClient.close();
    });

    expect(screen.getByTestId('connection-status')).toHaveTextContent(
      t('connection.status.closed'),
    );
    expect(screen.getByRole('button', { name: t('session.ping.action') })).toBeDisabled();
  });

  it('shows the loading state while the answer is on its way', async () => {
    render(<SessionPingPanel />);
    connect();

    await userEvent.click(screen.getByRole('button', { name: t('session.ping.action') }));

    expect(screen.getByLabelText(t('session.ping.pending'))).toBeInTheDocument();
  });

  it('renders the result, translated, once the event arrives', async () => {
    render(<SessionPingPanel />);
    connect();

    await userEvent.click(screen.getByRole('button', { name: t('session.ping.action') }));
    answer(1, 1);

    await waitFor(() => {
      expect(
        screen.getByText(t('session.ping.result', { count: 1, at: '2026-09-13T12:00:05.000Z' })),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(t('session.ping.sequence', { seq: 1 }))).toBeInTheDocument();
  });

  it('shows which session the round trip belongs to', async () => {
    render(<SessionPingPanel />);
    connect();

    await userEvent.click(screen.getByRole('button', { name: t('session.ping.action') }));
    answer(1, 1);

    await waitFor(() => {
      expect(
        screen.getByText(
          t('session.ping.sessionLabel', { sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ' }),
        ),
      ).toBeInTheDocument();
    });
  });

  it('sends one command when the button is clicked twice', async () => {
    render(<SessionPingPanel />);
    connect();
    const button = screen.getByRole('button', { name: t('session.ping.action') });

    await userEvent.click(button);
    await userEvent.click(button);

    const pings = sockets.latest.frames().filter((sent) => sent['type'] === 'session.ping');
    expect(pings).toHaveLength(1);
  });

  it('does not duplicate a result the replay delivers again', async () => {
    render(<SessionPingPanel />);
    connect();

    await userEvent.click(screen.getByRole('button', { name: t('session.ping.action') }));
    answer(1, 1);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));

    answer(1, 1);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('renders the language the visitor asked for', () => {
    render(<SessionPingPanel />, 'pt-BR');

    expect(
      screen.getByRole('button', { name: translator('pt-BR')('session.ping.action') }),
    ).toBeInTheDocument();
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<SessionPingPanel />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
