import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionStarter } from '@/features/session';
import { useOwnedSessionsStore } from '@/features/session/store/owned-sessions.store';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { renderRouted, translator } from '../../../support/render';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../support/fake-websocket';

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

/** The starter, on a real router, because what it does is navigate. */
describe('starting a session', () => {
  let sockets: InstalledWebSocket;
  let started: string[];

  beforeEach(() => {
    started = [];
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

  function mount(workspacePath: string | null) {
    return renderRouted(
      <SessionStarter
        workspacePath={workspacePath}
        onStarted={(sessionId) => started.push(sessionId)}
      />,
    );
  }

  it('cannot start without a folder, and says so', async () => {
    mount(null);
    connect();

    expect(await screen.findByText(t('session.starter.chooseWorkspace'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('session.starter.action') })).toBeDisabled();
  });

  it('cannot start while the socket is down', async () => {
    mount('/srv/projects/app');

    expect(await screen.findByRole('button', { name: t('session.starter.action') })).toBeDisabled();
  });

  it('asks the server to open the session on the chosen folder', async () => {
    const user = userEvent.setup();
    mount('/srv/projects/app');
    connect();

    await user.click(await screen.findByRole('button', { name: t('session.starter.action') }));

    expect(sockets.latest.frames().find((sent) => sent['type'] === 'session.start')).toMatchObject({
      payload: { workspacePath: '/srv/projects/app' },
    });
  });

  it('waits for the server to name the session, and then reports it', async () => {
    const user = userEvent.setup();
    mount('/srv/projects/app');
    connect();

    await user.click(await screen.findByRole('button', { name: t('session.starter.action') }));
    expect(screen.getByRole('button', { name: t('session.starter.pending') })).toBeDisabled();

    // The id is the server's to mint, so the screen waits rather than inventing one.
    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-1',
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
    });

    await waitFor(() => {
      expect(started).toEqual([SESSION]);
    });

    // S-84: claimed before the screen that shows it exists — it is this browser's to close.
    expect(useOwnedSessionsStore.getState().owned).toEqual([SESSION]);
  });

  it('keeps waiting through a session.started that names no session', async () => {
    const user = userEvent.setup();
    mount('/srv/projects/app');
    connect();

    await user.click(await screen.findByRole('button', { name: t('session.starter.action') }));

    // A frame that breaks the contract is not the answer: reporting it would navigate to a
    // session called `undefined`.
    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-1',
        kind: 'event',
        type: 'session.started',
        ts: AT,
        seq: 1,
        payload: { sessionId: 42, workspacePath: '/srv/projects/app' },
      });
    });

    expect(screen.getByRole('button', { name: t('session.starter.pending') })).toBeDisabled();
    expect(started).toEqual([]);
  });

  /** The `session.start` the screen sent last. */
  function lastStart(): Record<string, unknown> {
    const starts = sockets.latest.frames().filter((sent) => sent['type'] === 'session.start');
    const last = starts.at(-1);
    if (last === undefined) {
      throw new Error('no session.start was sent');
    }
    return last;
  }

  /** The server refusing a command for the ceiling, the way the gateway answers it. */
  function refuseForTheCeiling(correlationId: unknown): void {
    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'err-1',
        kind: 'error',
        type: 'error',
        ts: AT,
        correlationId,
        traceId: 'trace-limit',
        payload: {
          code: 'SESSION_LIMIT_REACHED',
          messageKey: 'session.error.limitReached',
          params: { limit: 2, retryAfterSeconds: 30 },
        },
      });
    });
  }

  it('S-80 — a start refused for the ceiling stops waiting and says why, translated', async () => {
    const user = userEvent.setup();
    mount('/srv/projects/app');
    connect();

    await user.click(await screen.findByRole('button', { name: t('session.starter.action') }));
    refuseForTheCeiling(lastStart()['id']);

    expect(
      await screen.findByText(t('session.error.limitReached', { limit: 2 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('common.error.traceLabel', { traceId: 'trace-limit' })),
    ).toBeVisible();

    // The button is free again — for when a slot is — and nothing was retried on its own.
    expect(screen.getByRole('button', { name: t('session.starter.action') })).toBeEnabled();
    expect(sockets.latest.frames().filter((sent) => sent['type'] === 'session.start')).toHaveLength(
      1,
    );
    expect(started).toEqual([]);
  });

  it('S-80 — the refusal of some other command on the same socket is not this one', async () => {
    const user = userEvent.setup();
    mount('/srv/projects/app');
    connect();

    await user.click(await screen.findByRole('button', { name: t('session.starter.action') }));
    refuseForTheCeiling('some-other-command');

    expect(screen.getByRole('button', { name: t('session.starter.pending') })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('S-80 — the next attempt clears the refusal before it is answered', async () => {
    const user = userEvent.setup();
    mount('/srv/projects/app');
    connect();

    await user.click(await screen.findByRole('button', { name: t('session.starter.action') }));
    refuseForTheCeiling(lastStart()['id']);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: t('session.starter.action') }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('session.starter.pending') })).toBeDisabled();
  });
});
