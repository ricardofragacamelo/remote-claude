import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const pending = {
  id: 'dev_1',
  name: 'Pixel 8',
  platform: 'android',
  appVersion: '1.0.0',
  locale: 'pt-BR',
  status: 'pending',
  pushEnabled: true,
  registeredAt: '2026-09-18T10:00:00.000Z',
  lastSeenAt: '2026-09-18T10:00:00.000Z',
  approvedAt: null,
  revokedAt: null,
};

/** The backend of this screen: the devices, and whatever else a screen asks, never answered. */
function devicesAre(...devices: readonly unknown[]): void {
  vi.spyOn(api, 'get').mockImplementation((path: string) =>
    path === '/devices' ? Promise.resolve({ devices }) : new Promise(() => undefined),
  );
}

describe('Devices, a screen of its own — plan 06, B-29', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the devices at /devices, in the frame, its place lit in the navigation — S-138', async () => {
    devicesAre(pending);

    mountApp('/devices');

    expect(await screen.findByText('Pixel 8')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: t('devices.screen.title') }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: t('navigation.entry.devices') })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('is not a section of Settings — S-138', async () => {
    devicesAre();
    const mounted = mountApp('/settings/devices');

    await waitFor(() => {
      expect(mounted.router.state.location.pathname).toBe('/settings/appearance');
    });
    expect(screen.queryByText(t('devices.list.title'))).toBeNull();
  });

  it('approves a device as before — S-138', async () => {
    devicesAre(pending);
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      ...pending,
      status: 'approved',
      approvedAt: '2026-09-30T10:00:00.000Z',
    });
    const user = userEvent.setup();
    mountApp('/devices');

    await user.click(await screen.findByRole('button', { name: t('devices.action.approve') }));

    expect(post).toHaveBeenCalledWith('/devices/dev_1/approval', {});
    expect(await screen.findByText(t('devices.status.approved'))).toBeInTheDocument();
  });

  it('teaches the next step when there is no device, and "learn more" opens the help at it — S-152, S-153', async () => {
    devicesAre();
    const user = userEvent.setup();
    mountApp('/devices');

    await screen.findByText(t('devices.list.emptyTitle'));
    await user.click(
      screen.getByRole('button', {
        name: t('help.learnMore.label', { topic: t('help.topic.devices') }),
      }),
    );

    const help = await screen.findByRole('complementary', {
      name: t('help.panel.title', { screen: t('devices.screen.title') }),
    });
    expect(within(help).getByText(t('devices.help.what'))).toBeVisible();
    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('help-what'));
    });
  });

  it('says what to do when the devices could not be read — S-152', async () => {
    vi.spyOn(api, 'get').mockImplementation((path: string) =>
      path === '/devices'
        ? Promise.reject(
            Object.assign(new Error('x'), {
              code: 'NETWORK_UNREACHABLE',
              messageKey: 'common.error.offline',
              params: {},
              traceId: 't',
            }),
          )
        : new Promise(() => undefined),
    );

    mountApp('/devices');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: t('common.action.retry') })).toBeVisible();
  });

  it('has no accessibility violation', async () => {
    devicesAre(pending);
    const { container } = mountApp('/devices');
    await screen.findByText('Pixel 8');

    expect(await axe(container)).toHaveNoViolations();
  });
});
