import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ConnectionPanel, PingPanel, usePingStore } from '@/features/diagnostics';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { CLOSE_RATE_LIMITED } from '@/shared/api/ws-client';
import { render, translator } from '../../../support/render';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../support/fake-websocket';

const t = translator('en');
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

/** A server frame, in the shape the gateway sends it. */
function frame(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    v: 1,
    id: 'srv-1',
    kind: 'event',
    type: 'diag.pong',
    ts: '2026-09-13T12:00:00.000Z',
    ...overrides,
  };
}

const readyFrame = frame({
  kind: 'ack',
  type: 'connection.ready',
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
});

/** Both panels of Logs and diagnostics, as the screen stacks them. */
function Diagnostics(): React.JSX.Element {
  return (
    <>
      <ConnectionPanel />
      <PingPanel />
    </>
  );
}

describe('Logs and diagnostics — plan 06, B-30', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    usePingStore.getState().reset();
    // The client refuses to open a socket it cannot authenticate; here the visitor is signed in.
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  /** Brings the connection up, as the providers would. */
  function connect(): void {
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
    });
  }

  /** The nonce of the last ping the screen sent. */
  function lastNonce(): string {
    const pings = sockets.latest.frames().filter((sent) => sent['type'] === 'diag.ping');
    return (pings.at(-1)?.['payload'] as { nonce: string }).nonce;
  }

  /** Delivers a pong, for the last ping or for another nonce. */
  function answer(seq: number, nonce = lastNonce()): void {
    act(() => {
      sockets.latest.receive(
        frame({
          seq,
          sessionId: SESSION,
          payload: {
            sessionId: SESSION,
            pingedAt: '2026-09-13T12:00:05.000Z',
            pingCount: seq,
            nonce,
          },
        }),
      );
    });
  }

  function pingButton(): HTMLElement {
    return screen.getByRole('button', { name: t('diagnostics.ping.action') });
  }

  it('teaches the next step before anything was sent — S-152', () => {
    render(<Diagnostics />);

    expect(screen.getByText(t('diagnostics.ping.empty'))).toBeInTheDocument();
    expect(pingButton()).toBeEnabled();
  });

  it('shows the state of the connection, translated, and nothing to reconnect while it is up', () => {
    render(<Diagnostics />);
    connect();

    expect(screen.getByRole('status')).toHaveTextContent(t('connection.status.ready'));
    expect(
      screen.queryByRole('button', { name: t('diagnostics.connection.reconnect') }),
    ).toBeNull();
  });

  it('sends a ping and shows its answer, the round trip and the sequence — S-139', async () => {
    const now = vi.spyOn(Date, 'now');
    render(<Diagnostics />);
    connect();

    now.mockReturnValue(10_000);
    await userEvent.click(pingButton());
    expect(screen.getByLabelText(t('diagnostics.ping.pending'))).toBeInTheDocument();

    now.mockReturnValue(10_042);
    answer(1);

    const row = await screen.findByText(t('diagnostics.ping.roundTrip', { ms: 42 }));
    expect(row).toBeInTheDocument();
    expect(screen.getByText(t('diagnostics.ping.sequence', { seq: 1 }))).toBeInTheDocument();
    expect(
      screen.getByText(t('diagnostics.ping.sessionLabel', { sessionId: SESSION })),
    ).toBeInTheDocument();
  });

  it('says a ping sent with the socket down did not leave, with the way to reconnect — S-140', async () => {
    render(<Diagnostics />);
    connect();
    act(() => {
      sockets.latest.close(4000);
    });

    await userEvent.click(pingButton());

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(t('common.error.offline'));
    await userEvent.click(
      within(alert).getByRole('button', { name: t('diagnostics.connection.reconnect') }),
    );
    expect(sockets.created).toHaveLength(2);
  });

  it('matches each answer to its own ping, two in a row — S-141', async () => {
    render(<Diagnostics />);
    connect();

    await userEvent.click(pingButton());
    answer(1);
    await waitFor(() => {
      expect(pingButton()).toBeEnabled();
    });
    await userEvent.click(pingButton());
    answer(2);

    await screen.findByText(t('diagnostics.ping.sequence', { seq: 2 }));
    const items = within(
      screen.getByRole('list', { name: t('diagnostics.ping.listLabel') }),
    ).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(t('diagnostics.ping.sequence', { seq: 2 }));
    expect(items[1]).toHaveTextContent(t('diagnostics.ping.sequence', { seq: 1 }));
  });

  it('keeps waiting when a pong that is not its answer arrives — S-205', async () => {
    render(<Diagnostics />);
    connect();

    await userEvent.click(pingButton());
    answer(1, 'another-window');

    expect(screen.getByLabelText(t('diagnostics.ping.pending'))).toBeInTheDocument();
    expect(pingButton()).toBeDisabled();
  });

  it('sends one ping when the button is clicked twice — 00·S-110', async () => {
    render(<Diagnostics />);
    connect();

    await userEvent.dblClick(pingButton());

    const pings = sockets.latest.frames().filter((sent) => sent['type'] === 'diag.ping');
    expect(pings).toHaveLength(1);
  });

  it('does not answer twice what the replay delivers again', async () => {
    render(<Diagnostics />);
    connect();

    await userEvent.click(pingButton());
    answer(1);
    await screen.findByText(t('diagnostics.ping.sequence', { seq: 1 }));

    answer(1);

    expect(screen.getAllByText(t('diagnostics.ping.sequence', { seq: 1 }))).toHaveLength(1);
  });

  it('reconnects on request once the connection dropped — S-200', async () => {
    render(<Diagnostics />);
    connect();
    act(() => {
      sockets.latest.close(4000);
    });

    await userEvent.click(
      screen.getByRole('button', { name: t('diagnostics.connection.reconnect') }),
    );

    expect(sockets.created).toHaveLength(2);
  });

  it('holds "reconnect" and says why while the server asked to slow down — S-200', () => {
    render(<Diagnostics />);
    connect();
    act(() => {
      sockets.latest.close(CLOSE_RATE_LIMITED);
    });

    expect(
      screen.getByRole('button', { name: t('diagnostics.connection.reconnect') }),
    ).toBeDisabled();
    expect(screen.getByText(t('diagnostics.connection.heldBack'))).toBeInTheDocument();
  });

  it('speaks the language the visitor asked for', () => {
    render(<Diagnostics />, 'pt-BR');

    expect(
      screen.getByRole('button', { name: translator('pt-BR')('diagnostics.ping.action') }),
    ).toBeInTheDocument();
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<Diagnostics />);
    connect();

    expect(await axe(container)).toHaveNoViolations();
  });
});
