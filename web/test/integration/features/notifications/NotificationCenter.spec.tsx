import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { commandRegistry } from '@/features/commands';
import { NotificationBell, NotificationHost, useNotifications } from '@/features/notifications';
import { BURST_MS, RETRY_MS } from '@/features/notifications/hooks/notification-outbox';
import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { notify } from '@/shared/lib/notify';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { aNotification, aNotificationServer } from '../../../support/notification-api';
import { render, translator } from '../../../support/render';

const t = translator('en');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mount() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
  const mounted = render(
    <main>
      <button type="button">{t('common.action.retry')}</button>
      <NotificationHost />
      <NotificationBell />
    </main>,
  );
  return { user, ...mounted };
}

/** Moves the clock past a wait, and lets what it started settle. */
async function after(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * The bell. Found by its label rather than its accessible name: while the centre, a modal, is open
 * over it, it is hidden from a screen reader — and a hidden element has no accessible name.
 */
function bell(): HTMLElement {
  const found = screen
    .getAllByRole('button', { hidden: true })
    .find((button) => /^Notifications: \d+ unread$/.test(button.getAttribute('aria-label') ?? ''));
  if (found === undefined) throw new Error('no bell');
  return found;
}

async function openCenter(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(bell());
  return screen.findByRole('dialog', { name: t('notifications.center.title') });
}

const lost = { severity: 'warning', messageKey: 'notification.connection.lost' } as const;

describe('a notification becomes a toast — plan 06, S-130, S-133', () => {
  it('says the translated message, as a status, without taking the focus', async () => {
    aNotificationServer();
    mount();
    const focused = screen.getByRole('button', { name: t('common.action.retry') });
    focused.focus();

    act(() => {
      notify({ severity: 'info', messageKey: 'notification.connection.restored' });
    });

    const toast = await screen.findByRole('status', { name: '' });
    expect(within(toast).getByText(t('notification.connection.restored'))).toBeVisible();
    expect(focused).toHaveFocus();
  });

  it('is an alert when it is an error', async () => {
    aNotificationServer();
    mount();

    act(() => {
      notify({
        severity: 'error',
        messageKey: 'notification.command.failed',
        params: { command: 'Open folder…', code: 'INTERNAL_ERROR' },
      });
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      t('notification.command.failed', { command: 'Open folder…', code: 'INTERNAL_ERROR' }),
    );
    expect(within(alert).getByText(t('notifications.severity.error'))).toBeInTheDocument();
  });

  it('goes by itself when nothing in it asks for an action', async () => {
    aNotificationServer();
    mount();

    act(() => {
      notify({ severity: 'info', messageKey: 'notification.connection.restored' });
    });
    await screen.findByText(t('notification.connection.restored'));
    await after(10_000);

    await waitFor(() => {
      expect(screen.queryByText(t('notification.connection.restored'))).toBeNull();
    });
  });

  it('stays while it asks for an action, and running the action closes it', async () => {
    aNotificationServer();
    const { user } = mount();
    const run = vi.fn();

    act(() => {
      notify({ ...lost, actions: [{ labelKey: 'common.action.retry', run }] });
    });
    const toast = await screen.findByRole('status', { name: '' });
    await after(60_000);
    expect(toast).toBeInTheDocument();

    await user.click(within(toast).getByRole('button', { name: t('common.action.retry') }));
    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText(t('notification.connection.lost'))).toBeNull();
    });
  });

  it('is closed by its own button', async () => {
    aNotificationServer();
    const { user } = mount();

    act(() => {
      notify(lost);
    });
    await user.click(await screen.findByRole('button', { name: t('notifications.toast.dismiss') }));

    await waitFor(() => {
      expect(screen.queryByText(t('notification.connection.lost'))).toBeNull();
    });
  });
});

describe('a burst — plan 06, S-132', () => {
  it('is one toast with a count, and one write to the server', async () => {
    const server = aNotificationServer();
    mount();

    act(() => {
      notify(lost);
      notify(lost);
      notify(lost);
    });

    expect(await screen.findByText(t('notifications.entry.count', { count: 3 }))).toBeVisible();
    expect(screen.getAllByText(t('notification.connection.lost'), { exact: false })).toHaveLength(
      1,
    );
    await after(BURST_MS);
    await waitFor(() => {
      expect(server.post).toHaveBeenCalledTimes(1);
    });
    expect(server.items()).toEqual([expect.objectContaining({ count: 3 })]);
  });
});

describe('the notification centre — plan 06, S-131', () => {
  it('reads the history from the server, and the bell counts what is unread', async () => {
    aNotificationServer([
      aNotification('n_2', { messageKey: 'notification.connection.restored', severity: 'info' }),
      aNotification('n_1', { readAt: '2026-09-30T12:30:00.000Z', count: 4 }),
    ]);
    const { user } = mount();

    await waitFor(() => {
      expect(bell()).toHaveAttribute('aria-label', t('notifications.bell.label', { count: 1 }));
    });
    const center = await openCenter(user);
    const rows = within(
      within(center).getByRole('list', { name: t('notifications.center.list') }),
    ).getAllByRole('listitem');

    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining(t('notification.connection.restored')),
      expect.stringContaining(t('notifications.entry.count', { count: 4 })),
    ]);
    expect(rows[0]).toHaveTextContent(/Unread/);
  });

  it('takes the focus on itself, not on a button with a tooltip, so one Esc closes it — S-160', async () => {
    aNotificationServer([]);
    const { user } = mount();

    const center = await openCenter(user);
    expect(center).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: t('notifications.center.title') })).toBeNull();
    });
  });

  it('finds the same history after a reload', async () => {
    const server = aNotificationServer();
    const first = mount();

    act(() => {
      notify(lost);
    });
    await after(BURST_MS);
    await waitFor(() => {
      expect(server.items()).toHaveLength(1);
    });
    first.unmount();

    const { user } = mount();
    const center = await openCenter(user);
    expect(await within(center).findByText(t('notification.connection.lost'))).toBeVisible();
  });

  it('marks one read, and every one read, on the server', async () => {
    const server = aNotificationServer([aNotification('n_2'), aNotification('n_1')]);
    const { user } = mount();
    const center = await openCenter(user);

    await user.click(
      (
        await within(center).findAllByRole('button', { name: t('notifications.entry.markRead') })
      )[0]!,
    );
    await waitFor(() => {
      expect(server.put).toHaveBeenCalledWith('/notifications/read', { ids: ['n_2'] });
    });
    await waitFor(() => {
      expect(bell()).toHaveAttribute('aria-label', t('notifications.bell.label', { count: 1 }));
    });

    await user.click(
      within(center).getByRole('button', { name: t('notifications.center.markAllRead') }),
    );
    await waitFor(() => {
      expect(bell()).toHaveAttribute('aria-label', t('notifications.bell.label', { count: 0 }));
    });
    expect(
      within(center).getByRole('button', { name: t('notifications.center.markAllRead') }),
    ).toBeDisabled();
  });

  it('clears one, and then all', async () => {
    const server = aNotificationServer([aNotification('n_2'), aNotification('n_1')]);
    const { user } = mount();
    const center = await openCenter(user);

    await user.click(
      (await within(center).findAllByRole('button', { name: t('notifications.entry.remove') }))[0]!,
    );
    await waitFor(() => {
      expect(server.items().map((item) => item.id)).toEqual(['n_1']);
    });
    await user.click(
      within(center).getByRole('button', { name: t('notifications.center.clearAll') }),
    );

    expect(await within(center).findByText(t('notifications.center.emptyTitle'))).toBeVisible();
    expect(server.items()).toEqual([]);
  });

  it('says in the centre — not as another notification — that a change failed', async () => {
    const server = aNotificationServer([aNotification('n_1')]);
    server.failing.deletes = 1;
    const { user } = mount();
    const center = await openCenter(user);

    await user.click(
      await within(center).findByRole('button', { name: t('notifications.entry.remove') }),
    );

    expect(await within(center).findByRole('alert')).toHaveTextContent(t('common.error.offline'));
    expect(server.items()).toHaveLength(1);
    expect(useNotifications.getState().pending).toEqual([]);
  });

  it('says when the history cannot be read, and reads it again on request', async () => {
    const server = aNotificationServer([aNotification('n_1')]);
    server.failing.gets = 2;
    const { user } = mount();
    const center = await openCenter(user);

    await user.click(await within(center).findByRole('button', { name: t('common.action.retry') }));

    expect(await within(center).findByText(t('notification.connection.lost'))).toBeVisible();
  });

  it('reads the older ones a page at a time', async () => {
    aNotificationServer(
      Array.from({ length: 3 }, (_, index) =>
        aNotification(`n_${String(index)}`, { params: {}, count: index + 1 }),
      ),
      2,
    );
    const { user } = mount();
    const center = await openCenter(user);
    await within(center).findAllByRole('listitem');
    expect(within(center).getAllByRole('listitem')).toHaveLength(2);

    await user.click(within(center).getByRole('button', { name: t('notifications.center.more') }));

    await waitFor(() => {
      expect(within(center).getAllByRole('listitem')).toHaveLength(3);
    });
  });

  it('with "do not disturb" on, shows no toast and still keeps the history — per visitor', async () => {
    const server = aNotificationServer();
    const { user } = mount();
    const center = await openCenter(user);

    await user.click(
      within(center).getByRole('button', { name: t('notifications.center.doNotDisturb') }),
    );
    expect(within(center).getByText(t('notifications.center.silenced'))).toBeVisible();
    expect(localStorage.getItem(`${VISITOR_PREFIX}notifications.doNotDisturb`)).toBe('true');

    act(() => {
      notify(lost);
    });
    expect(screen.queryByRole('status', { name: '' })).toBeNull();
    expect(await within(center).findByText(t('notification.connection.lost'))).toBeVisible();
    await after(BURST_MS);
    await waitFor(() => {
      expect(server.items()).toHaveLength(1);
    });
  });

  it('is reached from the palette, and so is "do not disturb"', async () => {
    aNotificationServer();
    mount();

    await act(async () => {
      await commandRegistry.command('notifications.doNotDisturb')?.run();
      await commandRegistry.command('notifications.show')?.run();
    });

    expect(
      await screen.findByRole('dialog', { name: t('notifications.center.title') }),
    ).toBeVisible();
    expect(useNotifications.getState().doNotDisturb).toBe(true);
    expect(commandRegistry.command('notifications.doNotDisturb')?.labelKey).toBe(
      'command.notifications.doNotDisturbOff',
    );
  });

  it('has no accessibility violation', async () => {
    aNotificationServer([aNotification('n_1')]);
    const { user } = mount();
    const center = await openCenter(user);
    await within(center).findByText(t('notification.connection.lost'));

    expect(await axe(center)).toHaveNoViolations();
  });
});

describe('a notification the server could not keep — plan 06, S-182', () => {
  it('keeps its toast and its place in the centre, and is sent again under the same client id', async () => {
    const server = aNotificationServer();
    server.failing.posts = 1;
    const { user } = mount();

    act(() => {
      notify(lost);
    });
    await after(BURST_MS);
    await waitFor(() => {
      expect(server.post).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      t('notification.connection.lost'),
    );
    const center = await openCenter(user);
    expect(await within(center).findByText(/not saved on this machine yet/)).toBeVisible();

    await after(RETRY_MS[0]);
    await waitFor(() => {
      expect(server.items()).toHaveLength(1);
    });
    const [first, second] = server.sentClientIds();
    expect(second).toBe(first);
    await waitFor(() => {
      expect(within(center).queryByText(/not saved on this machine yet/)).toBeNull();
    });
    expect(within(center).getAllByRole('listitem')).toHaveLength(1);
  });

  it('is cleared from the centre before it reached the server, and never sent', async () => {
    const server = aNotificationServer();
    server.failing.posts = 1;
    const { user } = mount();

    act(() => {
      notify(lost);
    });
    await after(BURST_MS);
    const center = await openCenter(user);
    await user.click(
      await within(center).findByRole('button', { name: t('notifications.entry.remove') }),
    );
    await after(RETRY_MS[0]);

    expect(server.post).toHaveBeenCalledTimes(1);
    expect(await within(center).findByText(t('notifications.center.emptyTitle'))).toBeVisible();
  });

  it('is sent at once when the connection comes back', async () => {
    let tell: (status: ConnectionStatus) => void = () => undefined;
    vi.spyOn(wsClient, 'onStatus').mockImplementation((listener) => {
      tell = listener;
      return () => undefined;
    });
    const server = aNotificationServer();
    server.failing.posts = 1;
    mount();

    act(() => {
      notify({
        severity: 'error',
        messageKey: 'notification.command.failed',
        params: { command: 'x', code: 'y' },
      });
    });
    await after(BURST_MS);
    await waitFor(() => {
      expect(server.post).toHaveBeenCalledTimes(1);
    });
    // One change at a time, as the socket reports them: batched, the drop would never be seen.
    for (const status of ['ready', 'reconnecting', 'ready'] as const) {
      act(() => {
        tell(status);
      });
    }
    expect(server.post).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(server.items().map((item) => item.messageKey)).toContain(
        'notification.command.failed',
      );
    });
  });

  it('is still said to somebody who cleared everything — the one on its way included', async () => {
    const server = aNotificationServer([aNotification('n_1')]);
    server.failing.posts = 1;
    const { user } = mount();

    act(() => {
      notify({ severity: 'info', messageKey: 'notification.connection.restored' });
    });
    await after(BURST_MS);
    const center = await openCenter(user);
    await within(center).findByText(/not saved on this machine yet/);

    await user.click(
      within(center).getByRole('button', { name: t('notifications.center.clearAll') }),
    );
    await after(RETRY_MS[0]);

    expect(server.post).toHaveBeenCalledTimes(1);
    expect(await within(center).findByText(t('notifications.center.emptyTitle'))).toBeVisible();
  });
});
